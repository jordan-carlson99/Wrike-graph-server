const express = require("express");
const { validationResult, header } = require("express-validator");
const { config } = require("dotenv");
const crypto = require("node:crypto");
const {
  processRFQ,
  processDataSheet,
  processOrder,
} = require("./modules/wrike/task");
const graphAccessData = require("./modules/graph/accessToken");
const rateLimit = require("express-rate-limit");
const { getRFQData, modifyGraphRFQ } = require("./modules/graph/rfq");
const getDatasheets = require("./modules/graph/datasheet");
const { getOrders, addOrder } = require("./modules/graph/order");
const getOrderAttachment = require("./modules/wrike/getOrderAttachment");
const { MongoClient } = require("mongodb");

// dotenv config
config();
// This is hashed to verify the source
let rawRequestBody = "";
// This is used to verify we haven't already sent that info (low latency check)
// TODO: add in a handler for when marked for completed to remove from this array

// TODO: make a function/module to update these
// Wrike to Graph conversions
const rfqCustomStatuses = [
  {
    id: "IEAF5SOTJMEAEFWQ",
    name: "In Progress",
  },
  {
    id: "IEAF5SOTJMEAEFW2",
    name: "Awaiting Assignment",
  },
  {
    id: "IEAF5SOTJMEAEFXE",
    name: "In Review",
  },
  {
    id: "IEAF5SOTJMEAFYJS",
    name: "New",
  },
  {
    id: "IEAF5SOTJMEAGWEI",
    name: "Peer Approved",
  },
  {
    id: "IEAF5SOTJMEAEFWR",
    name: "Completed",
  },
  {
    id: "IEAF5SOTJMEAG235",
    name: "Deleted",
  },
];
const dsCustomStatuses = [
  {
    id: "IEAF5SOTJMEEOFGO", //active
    name: "Working on Document",
  },
  {
    id: "IEAF5SOTJMEEOFGY", // peer review
    name: "Peer Review",
  },
  {
    id: "IEAF5SOTJMEEOFHC", // ready to route
    name: "Ready to Route",
  },
  {
    id: "IEAF5SOTJMEEOFHM", // routed
    name: "Routed for Approval",
  },
  {
    id: "IEAF5SOTJMEEOFGP", // completed
    name: "Approved in DMS-Complete",
  },
  {
    id: "IEAF5SOTJMEEOFIW", // need escalation
    name: "Needs Escalation",
  },
  {
    id: "IEAF5SOTJMEEOFJA", // pending info
    name: "Pending Information",
  },
  {
    id: "IEAF5SOTJMEEOFIM", // deferred
    name: "Open",
  },
  {
    id: "IEAF5SOTJMEEOFGP", // completed
    name: "Achieve",
  },
  {
    id: "IEAF5SOTJMEEOJ5Z", // cancelled
    name: "Canceled",
  },
  {
    id: "IEAF5SOTJMEEOFIM", // deferred
    name: "Closed",
  },
  {
    id: "IEAF5SOTJMEEOFGO", //active
    name: "Draft Completed",
  },
  {
    id: "IEAF5SOTJMEEOFHM", //routed
    name: "Routed",
  },
];
const orderCustomStatuses = [
  {
    id: "IEAF5SOTJMEGHU32",
    name: "Recieved",
  },
  {
    id: "IEAF5SOTJMEGHU4E",
    name: "Active",
  },
  {
    id: "IEAF5SOTJMEGHU33",
    name: "Completed",
  },
  {
    id: "IEAF5SOTJMEGHU4Q",
    name: "Deferred",
  },
  {
    id: "IEAF5SOTJMEGHU43",
    name: "Cancelled",
  },
];
const graphRFQPriorityToWrikeImportance = {
  High: "High",
  Medium: "Normal",
  Low: "Low",
};
const graphDSPriorityToWrikeImportance = {
  High: "High",
  Medium: "Normal",
  Low: "Low",
  Critical: "High",
};
const graphIDToWrikeID = { 12: "KUAQZDX2", 189: "KUARCPVF", 832: "KUAQ3CVX" };

// This will prevent DDoS
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

const app = express();

app.use(limiter);

app.set("trust proxy", 1);

// just used to verify the server is running
app.get("/", (req, res) => {
  res.send("up on /");
});

// This takes in raw Wrike body for comparing to value (x-hook-secret) to ensure origin is Wrike
app.post("/wrike/*", (req, res, next) => {
  try {
    rawRequestBody = "";
    req.on("data", (chunk) => {
      rawRequestBody += chunk;
    });
    next();
  } catch (error) {
    console.error(
      `There was an error parsing the raw data: ${error}\n ${error.stack}`
    );
    res.status(500).send();
  }
});

app.use(express.json());

// data validation for x-hook-secret removes all hits on endpoint without header
app.post("/wrike/*", header("X-Hook-Secret").notEmpty(), (req, res, next) => {
  const wrikeHookSecret = process.env.wrike_hook_secret;
  const errors = validationResult(req).errors;
  const calculatedHash = crypto
    .createHmac("sha256", wrikeHookSecret)
    .update(rawRequestBody)
    .digest("hex");
  const xHookSecret = req.get("X-Hook-Secret");

  try {
    // Initializes Wrike webhook
    if (req.body["requestType"] === "WebHook secret verification") {
      // Change
      const xHookCrypto = crypto
        .createHmac("sha256", wrikeHookSecret)
        .update(xHookSecret)
        .digest("hex");

      res.status(200).set("X-Hook-Secret", xHookCrypto).send();
      return;
    }

    // x-hook-secret is missing:
    if (errors.length != 0) {
      console.log(errors);
      res.status(400).send();
      return;
    }

    // This checks if the xhooksecret used the correct secret key
    // Wrong secret value:
    if (xHookSecret !== calculatedHash) {
      res.status(401).send(`Invalid hash`);
      console.log(
        `body: ${req.body} \n raw: ${rawRequestBody} \n xhooksecret: ${xHookSecret} \n calculated: ${calculatedHash}`
      );
      return;
    }

    next();
  } catch (error) {
    console.error(
      `there was an error valdiating the source of the request: ${error} \n ${error.stack}`
    );
  }
});

app.post("/wrike/rfq", async (req, res) => {
  let result;
  try {
    result = await modifyGraphRFQ(req.body, graphIDToWrikeID);
  } catch (e) {
    console.log(e);
  }

  if (result) {
    console.log("modified RFQ");
    res.status(200).send();
  } else {
    console.log("failed to modify RFQ");
    res.status(202).send();
  }
});

app.post("/wrike/order", async (req, res) => {
  let start = performance.now();
  // console.log(req.body);
  if (req.body[0].status == "Completed") {
    console.log("this status is complete");
    // get attachment
    const data = await getOrderAttachment(
      req.body[0].taskId,
      process.env.wrike_perm_access_token
    );
    const bufferString = data.attachment.toString("base64");
    const fileHash = crypto
      .createHash("sha256")
      .update(data.data[0].name)
      .digest("hex");

    // TODO: add a filter here which checks if the wrike ID

    let orderResult;

    try {
      const client = new MongoClient(process.env.mongoURL);
      const db = client.db(process.env.mongoDB);
      const ordersCollection = db.collection(process.env.mongoOrderCollection);
      const currentOrder = await ordersCollection.findOne({
        content: fileHash,
      });
      if (!currentOrder) {
        await ordersCollection.insertOne({
          id: req.body[0].taskId,
          content: fileHash,
        });
      }
      console.log({
        id: req.body[0].taskId,
        content: fileHash,
      });
      orderResult = await addOrder(
        bufferString,
        data.data[0].name,
        process.env.graph_power_automate_uri
      );
    } catch (error) {
      console.error(
        `there was an issue connecting to the mongoclient to upload hash and id: ${error}`
      );
    } finally {
      if (client) {
        await client.close();
      }
    }

    // ? What if there's more than 2
    let end = performance.now();
    console.log(`time taken: ${(end - start) / 1000}s`);
  }
  res.status(202).send();
});

app.post("/wrike/delete", async (req, res) => {
  console.log(JSON.stringify(req.body));
});

app.post("/graph/*", (req, res, next) => {
  if (req.url.includes("validationToken=")) {
    // have to check for %3A with a regex and replace matches since decodeURI treats them as special char
    res
      .contentType("text/plain")
      .status(200)
      .send(
        decodeURI(req.url.replace(/%3A/g, ":").split("validationToken=")[1])
      );
    return;
  }

  if (req.body.value[0].clientState !== process.env.graph_subscription_secret) {
    res.status(400).send();
    console.log(
      `client state didnt match: ${JSON.stringify(req.body.value[0])}`
    );
    return;
  }
  next();
});

app.post("/graph/rfq", async (req, res) => {
  let currentHistory = [];

  const accessData = await graphAccessData();
  let rfqData = await getRFQData(
    process.env.graph_site_id_sales,
    process.env.graph_list_id_rfq,
    accessData.access_token
  );

  // TODO: get custom statuses, get customers (CF), add reveiwer to custom field reviewer
  // Puts all the elements in an easy to read format
  rfqData.value.forEach((element) => {
    currentHistory.push({
      title: element.fields.Title,
      url: element.fields._dlc_DocIdUrl.Url,
      accountType: element.fields.Account_x0020_Type,
      contactEmail: element.fields.Contact_x0020_Email,
      contactName: element.fields.Contact_x0020_Name,
      customerName: element.fields.Customer_x0020_Name,
      customerRequestedDate: element.fields.Customer_x0020_Requested_x0020_Date,
      internalDueDate:
        element.fields.Internal_x0020_Due_x0020_Date ||
        element.fields.Customer_x0020_Requested_x0020_Date,
      startDate: element.createdDateTime,
      numberOfLineItems: element.fields.Number_x0020_of_x0020_Line_x0020_Items,
      priority:
        graphRFQPriorityToWrikeImportance[element.fields.Priority] ||
        graphRFQPriorityToWrikeImportance.Medium,
      quoteSource: element.fields.Quote_x0020_Source,
      status:
        rfqCustomStatuses.filter((s) => s.name == element.fields.Status)[0]
          .id || "IEAF5SOTJMEAFYJS",
      submissionMethod: element.fields.Submission_x0020_Method,
      modified: element.fields.Modified,
      id: element.id,
      assinged: graphIDToWrikeID[element.fields.AssignedLookupId] || null,
      reviewer: graphIDToWrikeID[element.fields.ReviewerLookupId] || null,
    });
  });
  let client;

  try {
    client = new MongoClient(process.env.mongoURL);
    const db = client.db(process.env.mongoDB);
    const wrikeTitles = db.collection(process.env.mongoRFQCollection);

    await Promise.all(
      currentHistory.map(async (rfq) => {
        try {
          await processRFQ(rfq, wrikeTitles);
        } catch (e) {
          console.error(
            `there was an issue processing RFQs (in route /graph/rfq): ${e} \n ${e.stack}`
          );
        }
      })
    );
  } catch (e) {
    console.log(`error mapping rfq: ${e}`);
  } finally {
    if (client) {
      await client.close();
    }
  }
  res.status(200).send("good");
});

app.post("/graph/datasheets", async (req, res) => {
  let currentHistory = [];
  const accessData = await graphAccessData();
  let datasheetData;
  try {
    datasheetData = await getDatasheets(
      process.env.graph_site_id_sales,
      process.env.graph_list_id_datasheet,
      accessData.access_token
    );
  } catch (e) {
    console.log(`There was an error fetching datasheets: ${e}`);
  }
  try {
    datasheetData.value.forEach((datasheet) => {
      currentHistory.push({
        title: `(DS) ${datasheet.fields.Title}` || null,
        description: null,
        priority:
          graphDSPriorityToWrikeImportance[datasheet.fields.field_5] ||
          graphDSPriorityToWrikeImportance.Medium,
        assignee: graphIDToWrikeID[datasheet.fields.Author0LookupId] || null,
        status:
          dsCustomStatuses.filter((s) => s.name == datasheet.fields.Status)[0]
            .id ||
          "IEAF5SOTJMEEOFGO" ||
          null,
        priorityNumber: datasheet.fields.Priority_x0023_ || null,
        guide: datasheet.fields.Guide_x002f_Mentor
          ? graphIDToWrikeID[datasheet.fields.Guide_x002f_Mentor.LookupId] ||
            null
          : null,
        startDate: datasheet.createdDateTime,
      });
    });
  } catch (e) {
    console.log(
      `there was an error iterating datasheets: ${e} \n data: ${JSON.stringify(
        datasheetData
      )}`
    );
  }
  try {
    client = new MongoClient(process.env.mongoURL);
    const db = client.db(process.env.mongoDB);
    const wrikeTitles = db.collection(process.env.mongoDatasheetCollection);
    await Promise.all(
      currentHistory.map(async (ds) => {
        await processDataSheet(ds, wrikeTitles);
      })
    );
  } catch (e) {
    console.log(`error mapping datasheets: ${e}`);
  } finally {
    if (client) {
      await client.close();
    }
  }

  res.status(200).send("good");
});

app.post("/graph/order", async (req, res) => {
  // Graph sends this once a new order is created
  let currentHistory = [];
  const accessData = await graphAccessData();
  const skipToken = process.env.graph_order_skip_token;
  try {
    orderData = await getOrders(
      process.env.graph_site_id_sales,
      process.env.graph_list_id_order,
      accessData.access_token,
      skipToken
    );
  } catch (e) {
    console.log(`There was an error fetching orders: ${e}`);
  }

  let wrikeTitles;
  let client;
  // connect to mongo
  try {
    client = new MongoClient(process.env.mongoURL);
    const db = client.db(process.env.mongoDB);
    wrikeTitles = db.collection(process.env.mongoOrderCollection);
  } catch (error) {
    console.error(`there was an error connecting to mongo: ${error}`);
  }

  try {
    for (let order of orderData) {
      // console.log(order.createdBy.user.displayName);
      // ! with the time limit on vercel, there's no other way to know whether it was created by the API or not
      if (order.createdBy.user.displayName == "System") {
        console.log("this was created from a Wrike item");

        const fileHash = crypto
          .createHash("sha256")
          .update(order.fields.FileLeafRef)
          .digest("hex");
        // Get mongo entry for given resource id
        wrikeTitles.findOneAndUpdate(
          { content: fileHash },
          { $set: { graphID: order.id } }
        );
        continue;
      }

      const desc = `URL: ${order.fields._dlc_DocIdUrl.url || "none"} 
      <br> Entered date: ${order.createdDateTime} 
      <br> PO number: ${order.fields.PONumber || "none"} 
      <br> SO number: ${order.fields.SONumber || "none"}
      <br> Customer: ${order.fields.CustomerName || "none"}
      <br> Author: ${graphIDToWrikeID[order.fields.AuthorLookupId] || "null"}`;

      currentHistory.push({
        title: order.fields.FileLeafRef || null,
        url: order.fields._dlc_DocIdUrl.url || null,
        startDate: order.createdDateTime || null,
        author: graphIDToWrikeID[order.fields.AuthorLookupId] || null,
        customerName: order.fields.CustomerName || null,
        poType: order.fields.POType || null,
        shipToSite: order.fields.ShipToSite || null,
        poNumber: order.fields.PONumber || null,
        soNumber: order.fields.SONumber || null,
        id: order.id,
        description: null,
      });
    }
  } catch (e) {
    console.error(`there was an error iterating order: ${e}`);
  }
  try {
    await Promise.all(
      currentHistory.map(async (or) => {
        await processOrder(or, wrikeTitles);
      })
    );
  } catch (e) {
    console.error(`there was an error mapping order: ${e} ${e.stack}`);
  } finally {
    if (client) {
      await client.close();
    }
  }
  res.status(200).send("good");
});

app.use("*", (req, res) => {
  res.status(400).send("Something went wrong");
});

app.listen(5501, () => {
  console.log("running server");
});

app.listen();

module.exports = app;
