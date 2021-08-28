const { v4: uuidv4 } = require('uuid')
const moment = require('moment')
moment.updateLocale('en', {
    week: {
        dow: 1, // Monday is the first day of the week.
    }
});

const AWS = require('aws-sdk');
AWS.config.update({ region: 'ap-southeast-1' });
var ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
require('dotenv').config()

module.exports.getAllRecurringPayments = () => {
    let params = {
        TableName: process.env.TABLE_NAME,
        FilterExpression: "category = :category",
        ExpressionAttributeValues: {
            ":category": {
                "S": 'recurring'
            }
        }
    }
    return scan(params)
}

module.exports.getExpenses = async (start_date, end_date) => {
    let params = {
        TableName: process.env.TABLE_NAME,
        FilterExpression: "category = :category and insert_date between :start_date and :end_date",
        ExpressionAttributeValues: {
            ":category": {
                "S": 'expense'
            },
            ":start_date": {
                "S": start_date
            },
            ":end_date": {
                "S": end_date
            }
        }
    }
    return await scan(params)
}

module.exports.deleteRecurringPayment = async (item) => {
    let params = {
        TableName: process.env.TABLE_NAME,
        FilterExpression: "category = :category and tag = :tag",
        ExpressionAttributeValues: {
            ":category": {
                "S": 'recurring'
            },
            ":tag": {
                "S": item.tag
            }
        }
    }
    let items = await scan(params)
    if (items.length != 0) {
        let id = items[0].id
        return remove(id)
    } else {
        return false
    }
}

module.exports.writeToTable = (item) => {
    let type = item.type
    let tag = item.tag
    let value = item.value
    let params = {
        TableName: process.env.TABLE_NAME,
        Item: {
            'id': { S: uuidv4() },
            'category': { S: type },
            'tag': { S: tag },
            'value': { N: value },
            'insert_date': { S: moment().format('YYYY-MM-DD') }
        }
    }
    return put(params)
}

module.exports.createExpenseTable = async () => {
    var params = {
        TableName: process.env.TABLE_NAME,
        KeySchema: [
            { AttributeName: "id", KeyType: "HASH" }, //Partition key
        ],
        AttributeDefinitions: [
            { AttributeName: "id", AttributeType: "S" },
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };
    let res = true
    await ddb.createTable(params).promise().catch(err => {
        res = false
    })
    return res
}

module.exports.updateRecurringExpense = async (value, isNew) => {
    // retrieve relevant recurring expense first
    let params = {
        TableName: process.env.TABLE_NAME,
        FilterExpression: "category = :category and tag = :tag and insert_date between :start_date and :end_date",
        ExpressionAttributeValues: {
            ":category": {
                "S": 'expense'
            },
            ":tag": {
                "S": 'recurring'
            },
            ":start_date": {
                "S": moment().startOf('month').format('YYYY-MM-DD')
            },
            ":end_date": {
                "S": moment().endOf('month').format('YYYY-MM-DD')
            }
        }
    }
    let recurring = await scan(params)
    if (recurring.length != 0)
        remove(recurring[0].id)
    let newVal = 0
    // prepoulate recurring expense entry if already present
    if(recurring.length != 0)
        newVal = parseFloat(recurring[0].value)
    // update expense entry based on type - new/remove
    if (isNew) {
        newVal += value
    } else {
        newVal = newVal == 0 ? newVal : newVal - value
    }
    params = {
        TableName: process.env.TABLE_NAME,
        Item: {
            'id': { S: uuidv4() },
            'category': { S: 'expense' },
            'tag': { S: 'recurring' },
            'value': { N: newVal.toString() },
            'insert_date': { S: moment().format('YYYY-MM-DD') }
        }
    }
    return put(params)
}

const put = (params) => {
    let is_success = ddb.putItem(params, (err, data) => {
        if (err) {
            console.log(err)
            return false
        } else {
            return true
        }
    })
    return is_success
}

const scan = async (params) => {
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
        is_success = true
    })
    await Promise.all([deletePromise])
    return is_success
}
