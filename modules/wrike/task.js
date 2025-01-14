const wrikeCustomFields = {
  Customer: "IEAF5SOTJUAFB2KU",
  Reviewer: "IEAF5SOTJUAE4XCY",
  Impact: "IEAF5SOTJUAEUZME",
  Priority: "IEAF5SOTJUAFCL3W",
  Guide: "IEAF5SOTJUAFCL3U",
  CreatedBy: "IEAF5SOTJUAFJRBT",
};

const graphIDToWrikeID = { 12: "KUAQZDX2", 189: "KUARCPVF", 832: "KUAQ3CVX" };
async function createTask(
  title,
  folderId,
  access_token,
  description,
  status,
  importance,
  dates,
  shareds,
  parents,
  responsibles,
  metadata,
  customFields,
  customStatus,
  fields
) {
  let URI;
  const maxRetries = 3;
  let retryCount = 0;
  const retryDelay = 1000;
  let response;
  while (retryCount < maxRetries) {
    try {
      if (title === undefined || folderId === undefined) {
        return;
      }

      // these need to be defined since Wrike doesnt take URI encoding for objects
      const stringArr = [
        "title",
        "description",
        "status",
        "importance",
        "customStatus",
      ];

      const params = {
        title: title || null,
        description: description || null,
        status: status || null,
        importance: importance || null,
        dates: dates || null, // obj
        shareds: shareds || null, //array
        parents: parents || null, // array
        responsibles:
          responsibles === null
            ? null
            : responsibles.length > 0
            ? responsibles
            : null, // array
        metadata: metadata || null, // array
        customFields: customFields || null, // array
        customStatus: customStatus || null,
        fields: fields || null, // array
      };

      const queryParams = [];

      for (const key in params) {
        if (params[key] !== null) {
          if (stringArr.includes(key)) {
            // if its a string
            queryParams.push(`${key}=${encodeURIComponent(params[key])}`);
          } else {
            // if its an object
            queryParams.push(`${key}=${JSON.stringify(params[key])}`);
          }
        }
      }

      const queryString = queryParams.join("&");

      const requestOptions = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
      };

      URI = `https://www.wrike.com/api/v4/folders/${folderId}/tasks?${queryString}`;
      // console.log(`URL: ${URL} \n tokentype:${typeof access_token}`);

      response = await fetch(URI, requestOptions);
      // console.log(response);

      if (!response.ok) {
        throw new Error(
          `Request failed with status ${response.status}, ${response.statusText}. \n URL: ${URI}`
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      lastError = error;
      console.error(
        `An error occured while modifying a task: ${error}\n${await response?.text()} \n URL: ${URI} \n retry ${retryCount}`
      );
      retryCount++;
      await new Promise((p) => {
        setTimeout(p, retryDelay);
      });
    }
  }
}

async function modifyTask(
  taskId,
  folderId,
  access_token,
  description,
  status,
  importance,
  dates,
  shareds,
  parents,
  addResponsibles,
  metadata,
  customFields,
  customStatus,
  fields,
  removeResponsibles,
  title,
  restore
) {
  let URI;
  const maxRetries = 3;
  let retryCount = 0;
  const retryDelay = 1000;
  while (retryCount < maxRetries) {
    try {
      if (taskId === undefined || folderId === undefined) {
        console.log("key info undefined for modify task");
        return;
      }
      const stringArr = [
        "title",
        "description",
        "status",
        "importance",
        "customStatus",
      ];
      const params = {
        description: description || null,
        status: status || null,
        importance: importance || null,
        dates: dates || null,
        shareds: shareds || null,
        parents: parents || null,
        addResponsibles: addResponsibles || null,
        metadata: metadata || null,
        customFields: customFields || null,
        customStatus: customStatus || null,
        fields: fields || null,
        removeResponsibles: removeResponsibles || null,
        title: title || null,
        restore: restore || null,
      };
      const queryParams = [];

      for (const key in params) {
        if (params[key] !== null) {
          if (stringArr.includes(key)) {
            // if its a string
            queryParams.push(`${key}=${encodeURIComponent(params[key])}`);
          } else {
            // if its an object
            queryParams.push(`${key}=${JSON.stringify(params[key])}`);
          }
        }
      }

      const queryString = queryParams.join("&");

      URI = `https://www.wrike.com/api/v4/tasks/${taskId}?${queryString}`;
      const response = await fetch(URI, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });
      if (!response.ok) {
        let errormsg = JSON.parse(await response.text());
        console.log(errormsg);

        // if its a deleted task, restore it
        // ! this is opinionated that if something calls this function it trumps what Wrike has already done
        if (
          errormsg.errorDescription ===
          "Operation is not allowed on deleted Folder/Task"
        ) {
          modifyTask(
            taskId,
            folderId,
            access_token,
            description,
            status,
            importance,
            dates,
            shareds,
            parents,
            addResponsibles,
            metadata,
            customFields,
            customStatus,
            fields,
            removeResponsibles,
            title,
            true
          );
        }

        throw new Error(
          `Request failed with status ${
            response.status
          }\n${await response.text()}`
        );
      }
      const data = await response.json();
      return await data;
    } catch (error) {
      lastError = error;
      console.error(
        `An error occured while modifying a task: ${error} \n URL: ${URI} \n retry ${retryCount}`
      );
      retryCount++;
      await new Promise((p) => {
        setTimeout(p, retryDelay);
      });
    }
  }
}

async function deleteTask(taskId, access_token) {
  try {
    const response = await fetch(
      `https://www.wrike.com/api/v4/tasks/${taskId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    return await data;
  } catch (error) {
    console.error(`An error occured while deleting a task: ${error}`);
    throw error;
  }
}

async function getTasks(taskId, access_token) {
  taskId = taskId || "";
  try {
    let URI = "https://www.wrike.com/api/v4/tasks/";
    if (typeof taskId === "object") {
      let tasks = taskId.join("%2C%20");
      URI += tasks;
    } else {
      URI += taskId;
    }
    const response = await fetch(URI, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    return await data;
  } catch (error) {
    console.error(`An error occured while getting a task: ${error}`);
    throw error;
  }
}

async function getComments(taskId, access_token) {
  taskId = `/${taskId}` || "";
  try {
    let URI = `https://www.wrike.com/api/v4/tasks${taskId}/comments/`;
    const response = await fetch(URI, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    return await data;
  } catch (error) {
    console.error(`An error occured while getting a task: ${error}`);
    throw error;
  }
}

// TODO: update the given RFQ if found and replace title, check for both title and rfq.id  (ln 275)
async function processRFQ(rfq, wrikeTitles, users) {
  return new Promise(async (resolve, reject) => {
    // TODO: Move most of these to custom fields

    const descriptionStr = `Title: (RFQ) ${rfq.title} <br>
    Link to SharePoint: ${rfq.url} <br>
    Customer Name: ${rfq.customerName} <br>
    Account Type: ${rfq.accountType} <br>
    Contact Email: ${rfq.contactEmail} <br>
    Contact Name: ${rfq.contactName} <br>
    Requested Date (Customer): ${rfq.customerRequestedDate} <br>
    Due Date: ${rfq.internalDueDate} <br>
    # Line Items: ${rfq.numberOfLineItems} <br>
    Priority: ${rfq.priority} <br>
    ID: ${rfq.id}
    `;

    let title;
    let userIdArr = [];
    try {
      await performMongoOperation(async () => {
        title = await wrikeTitles.findOne({ graphID: rfq.id });
      });
    } catch (error) {
      console.log(`MongoDB operation failed after multiple retries: ${error}`);
      reject(error);
    }
    try {
      // ? this should be in the modify task condition, why is it here?
      let allUsers;
      await performMongoOperation(async () => {
        allUsers = await users.find();
      });
      allUsers.forEach((user) => {
        if (user.wrikeUser) {
          userIdArr.push(user.wrikeUser);
        }
      });
    } catch (error) {
      console.log(`MongoDB operation failed after multiple retries: ${error}`);
      reject(error);
    }

    // if this title hasn't been put into the system yet:
    if (title === null) {
      try {
        createTask(
          `(RFQ) ${rfq.title}`,
          process.env.wrike_folder_rfq,
          process.env.wrike_perm_access_token,
          descriptionStr,
          null,
          rfq.priority,
          rfq.internalDueDate
            ? {
                start: rfq.startDate.slice(0, rfq.startDate.length - 2),
                due: rfq.internalDueDate.slice(
                  0,
                  rfq.internalDueDate.length - 2
                ),
              }
            : null,
          null,
          null,
          [...(rfq.assinged == null ? [] : [rfq.assinged])],
          null,
          rfq.reviewer && rfq.customerName
            ? [
                {
                  id: wrikeCustomFields.Customer,
                  value: rfq.customerName.toUpperCase(),
                },
                { id: wrikeCustomFields.Reviewer, value: rfq.reviewer },
              ]
            : rfq.reviewer
            ? [{ id: wrikeCustomFields.Reviewer, value: rfq.reviewer }]
            : rfq.customerName
            ? [
                {
                  id: wrikeCustomFields.Customer,
                  value: rfq.customerName.toUpperCase(),
                },
              ]
            : null,
          rfq.status,
          null
        ).then(async (data) => {
          if (data) {
            try {
              await performMongoOperation(async () => {
                // ! These 2 asyncs are the only way we're able to close the connection in index
                await wrikeTitles.insertOne({
                  title: `(RFQ) ${rfq.title}`,
                  id: data.data[0].id,
                  graphID: rfq.id,
                });
              });

              console.log("is new");
              resolve("new and completed");
            } catch (error) {
              console.log(
                `error with inserting rfq: ${error} \n data: ${JSON.stringify(
                  data
                )}`
              );
              reject(error);
            }
          } else {
            console.log("data undefined!");
            reject("data undefined");
          }
        });
      } catch (error) {
        console.log(`error creating rfq: ${error}`);
        reject(error);
      }

      // MODIFY RFQ --------------------------------------
    } else {
      // if it exists in the system, modify the task
      const taskID = title.id;
      try {
        await modifyTask(
          taskID,
          process.env.wrike_folder_rfq,
          process.env.wrike_perm_access_token,
          descriptionStr,
          null,
          rfq.priority,
          rfq.internalDueDate
            ? {
                start: rfq.startDate.slice(0, rfq.startDate.length - 2),
                due: rfq.internalDueDate.slice(
                  0,
                  rfq.internalDueDate.length - 2
                ),
              }
            : null,
          null,
          null,
          [...(rfq.assinged == null ? [] : [rfq.assinged])],
          null,
          rfq.reviewer && rfq.customerName
            ? [
                {
                  id: wrikeCustomFields.Customer,
                  value: rfq.customerName.toUpperCase(),
                },
                { id: wrikeCustomFields.Reviewer, value: rfq.reviewer },
              ]
            : rfq.reviewer
            ? [{ id: wrikeCustomFields.Reviewer, value: rfq.reviewer }]
            : rfq.customerName
            ? [
                {
                  id: wrikeCustomFields.Customer,
                  value: rfq.customerName.toUpperCase(),
                },
              ]
            : null,
          rfq.status,
          null,
          // This is required to remove ALL responsibles, we basically go through the entire user collection
          [...(rfq.assinged == null ? userIdArr : [])],
          `(RFQ) ${rfq.title}`
        );
        try {
          await performMongoOperation(async () => {
            // ! These 2 asyncs are the only way we're able to close the connection in index
            await wrikeTitles.findOneAndUpdate(
              { _id: title._id },
              { $set: { title: rfq.title } }
            );
          });

          console.log("not new, but modified");
          resolve("not new and modified");
        } catch (error) {
          console.log(
            `error modifying rfq in wrike: ${error} \n data: ${JSON.stringify(
              data
            )}`
          );
          reject(error);
        }
      } catch (error) {
        console.log(`error updating rfq: ${error}`);
        reject(error);
      }
    }
  });
}

async function processDataSheet(datasheet, wrikeTitles, users) {
  let title;
  return new Promise(async (resolve, reject) => {
    try {
      title = await wrikeTitles.findOne({ title: datasheet.title });
    } catch (error) {
      console.error(
        `there was an issue connecting to datasheet collection: ${error}`
      );
      reject(`there was an issue connecting to datasheet collection: ${error}`);
    }

    // determine custom fields array
    let customFieldsArray = [
      {
        id: wrikeCustomFields.Priority,
        value: parseInt(datasheet.priorityNumber),
      },
    ];
    if (datasheet.guide) {
      customFieldsArray.push({
        id: wrikeCustomFields.Reviewer,
        value: datasheet.guide,
      });
    }
    if (datasheet.createdBy) {
      customFieldsArray.push({
        id: wrikeCustomFields.CreatedBy,
        value: datasheet.createdBy,
      });
    }
    console.log(customFieldsArray);

    if (title === null) {
      try {
        createTask(
          datasheet.title,
          process.env.wrike_folder_datasheet_requests,
          process.env.wrike_perm_access_token,
          datasheet.description,
          null,
          datasheet.priority,
          {
            start: datasheet.startDate.slice(0, datasheet.startDate.length - 1),
            duration: 4800,
          },
          null,
          null,
          datasheet.assignee ? [datasheet.assignee] : null,
          null,
          customFieldsArray,
          datasheet.status,
          null
        ).then(async (data) => {
          console.log("new datasheet");
          try {
            await wrikeTitles.insertOne({
              title: datasheet.title,
              id: data.data[0].id,
              graphID: datasheet.graphID,
            });
            resolve("new datasheet added");
          } catch (e) {
            console.error(`Error while inserting datasheet: ${e}`);
            reject(`Error while inserting datasheet: ${e}`);
          }
        });
      } catch (e) {
        console.error(`error creating datasheet: ${e}`);
        reject(`error creating datasheet: ${e}`);
      }
    } else {
      let allUsers;
      let userIdArr = [];
      try {
        await performMongoOperation(async () => {
          allUsers = await users.find();
        });
        await allUsers.forEach((user) => {
          if (user.wrikeUser) {
            userIdArr.push(user.wrikeUser);
          }
        });
      } catch (error) {
        console.log(
          `MongoDB operation failed after multiple retries: ${error}`
        );
        reject(error);
      }
      try {
        const taskID = title.id;
        modifyTask(
          taskID,
          process.env.wrike_folder_datasheet_requests,
          process.env.wrike_perm_access_token,
          datasheet.description,
          null,
          datasheet.priority,
          {
            start: datasheet.startDate.slice(0, datasheet.startDate.length - 1),
            duration: 4800,
          },
          null,
          null,
          datasheet.assignee ? [datasheet.assignee] : null,
          null,
          customFieldsArray,
          datasheet.status,
          null,
          [...(datasheet.assingee == null ? userIdArr : [])]
        ).then(async (data) => {
          try {
            await wrikeTitles.findOneAndUpdate(
              { id: data?.data[0].id },
              { $set: { graphID: datasheet.graphID } }
            );
            console.log("updated datasheet");
            resolve("new datasheet");
          } catch (error) {
            reject(`failed to update mongo entry: ${error} \n ${error.stack}`);
          }
        });
      } catch (e) {
        console.error(`error editing datasheet: ${e}`);
        reject(`error editing datasheet: ${e}`);
      }
    }
  });
}

async function processOrder(order, wrikeTitles) {
  return new Promise(async (resolve, reject) => {
    let title;
    try {
      title = await wrikeTitles.findOne({ graphID: order.id });
    } catch (error) {
      const err = `there was an error finding the id in db: ${error}`;
      console.error(err);
      reject(err);
    }
    if (title == null) {
      try {
        createTask(
          order.title,
          process.env.wrike_folder_orders,
          process.env.wrike_perm_access_token,
          order.description,
          // TODO: get statuses
          "Completed",
          null,
          // TODO: figure start date (basedo n priority? tier system?)
          null,
          null,
          null,
          order.author ? [order.author] : null,
          null,
          null,
          null
        ).then(async (data) => {
          console.log("new order");
          try {
            await wrikeTitles.insertOne({
              id: data.data[0].id,
              graphID: order.id,
            });
            resolve("added new order");
          } catch (e) {
            const err = `Error while inserting order: ${e}`;
            throw new Error(err);
          }
        });
      } catch (e) {
        const err = `error creating order: ${e}`;
        console.log(err);
        reject(err);
      }
    } else {
      const taskID = title.id;
      try {
        await modifyTask(
          taskID,
          process.env.wrike_folder_orders,
          process.env.wrike_perm_access_token,
          order.description,
          "Completed",
          null,
          null,
          null,
          null,
          order.author ? [order.author] : null,
          null,
          null,
          null,
          null,
          [...(order.author == null ? Object.values(graphIDToWrikeID) : [])],
          order.title
        ).then((data) => {
          console.log("updated order");
          resolve("order updated");
        });
      } catch (e) {
        const err = `error modifying order: ${e}`;
        console.log(err);
        reject(err);
      }
    }
  });
}

module.exports = {
  createTask,
  modifyTask,
  deleteTask,
  getTasks,
  processRFQ,
  processDataSheet,
  processOrder,
  getComments,
};

async function performMongoOperation(operation, retries = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;
  try {
    return await operation();
  } catch (error) {
    if (retries < MAX_RETRIES) {
      console.log(
        `MongoDB operation failed. Retrying (${retries + 1}/${MAX_RETRIES})...`
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return performMongoOperation(operation, retries + 1);
    } else {
      throw error; // Max retries reached, propagate the error
    }
  }
}
