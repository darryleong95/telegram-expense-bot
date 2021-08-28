const TelegramBot = require('node-telegram-bot-api')
const AWS = require('aws-sdk')
const { v4: uuidv4 } = require('uuid')
require('dotenv').config()

AWS.config.update({ region: process.env.REGION })
var ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' })
const bot = new TelegramBot(process.env.TOKEN, { polling: true })
const chatId = process.env.CHAT_ID
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

exports.handler = async (event) => {
    // retrieve all expenses from given week
    var startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)
    var endDate = new Date()
    endDate.setDate(endDate.getDate() - 1)
    console.log(startDate, endDate)
    var expenses = await getExpenses(formatDate(startDate), formatDate(endDate))
    
    // populate tags
    const tags = await getTags()
    var aggregate_map = {}
    for (let cat of tags) {
        aggregate_map[cat.tag] = 0
    }

    // remove all items
    for (let item of expenses) {
        await remove(item.id)
        if (!(item.tag in aggregate_map))
            aggregate_map[item.tag] = parseFloat(item.value)
        else
            aggregate_map[item.tag] += parseFloat(item.value)
    }

    // insert aggregated values
    var is_success = true
    for (const tag in aggregate_map) {
        let params = {
            TableName: process.env.TABLE_NAME,
            Item: {
                'id': { S: uuidv4() },
                'category': { S: 'expense' },
                'tag': { S: tag },
                'value': { N: aggregate_map[tag].toString() },
                'insert_date': { S: formatDate(startDate) }
            }
        }
        is_success = !put(params) ? false : true
    }

    var month = months[new Date().getMonth()]
    var message = is_success ? `Transactions for last week has been successfully aggregated 😊!` : `Unable to aggregated transactions for last week 😞`
    await bot.sendMessage(chatId, message).then(x => {
        // return success
        const response = {
            statusCode: 200,
            body: JSON.stringify(`Succesfully aggregated transactions for the Month of ${month}`),
        };
        return response;
    }).catch(error => {
        // return error
        const response = {
            statusCode: 500,
            body: JSON.stringify(`Failed to aggregated transactions for the Month of ${month}`),
        };
        return response;
    })
}

const getExpenses = async (startDate, endDate) => {
    let params = {
        TableName: process.env.TABLE_NAME,
        FilterExpression: "category = :category and insert_date between :startDate and :endDate",
        ExpressionAttributeValues: {
            ":category": {
                "S": 'expense'
            },
            ":startDate": {
                "S": startDate
            },
            ":endDate": {
                "S": endDate
            }
        }
    }
    return await scan(params)
}

const scan = async (params) => {
    // Create a bot that uses 'polling' to fetch new updates
    let scannedItems = []
    const scanPromise = ddb.scan(params).promise().then(data => {
        data.Items.forEach(function (e, index, array) {
            let item = {
                tag: e.tag.S,
                value: e.value.N,
                id: e.id.S
            }
            scannedItems.push(item)
        });
    })
    await Promise.all([scanPromise])
    return scannedItems
}

const getTags = async () => {
    let params = {
        TableName: process.env.TABLE_NAME,
        FilterExpression: "category = :category",
        ExpressionAttributeValues: {
            ":category": {
                "S": 'tag'
            }
        }
    }
    return await scan(params)
}

const formatDate = (date) => {
    let month = date.getMonth() + 1
    let day = date.getDate()
    if (date.getMonth() + 1 < 10) {
        month = '0' + (date.getMonth() + 1)
    }
    if (date.getDate() < 10) {
        day = '0' + date.getDate()
    }
    return date.getFullYear() + '-' + month + '-' + day;
}

const remove = async (id) => {
    let is_success = false
    var params = {
        TableName: process.env.TABLE_NAME,
        Key: {
            "id": {
                "S": id
            },
        }
    };
    const deletePromise = ddb.deleteItem(params).promise().then(data => {
        console.log("Deleted Item:", JSON.stringify(data, null, 2));
        is_success = true
    })
    await Promise.all([deletePromise])
    return is_success
}

const put = (params) => {
    let is_success = ddb.putItem(params, (err, data) => {
        if (err) {
            return false
        } else {
            return true
        }
    })
    return is_success
}