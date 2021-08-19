const { formatDate } = require('./helpers')
const { v4: uuidv4 } = require('uuid')

const AWS = require('aws-sdk');
AWS.config.update({ region: 'ap-southeast-1' });
var ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });


module.exports.getAllRecurringPayments = () => {
    let params = {
        TableName: 'expense-table',
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
        TableName: 'expense-table',
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
        TableName: 'expense-table',
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
    let today = new Date()
    date = formatDate(today)
    let params = {
        TableName: 'expense-table',
        Item: {
            'id': { S: uuidv4() },
            'category': { S: type },
            'tag': { S: tag },
            'value': { N: value },
            'insert_date': { S: date }
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
        TableName: 'expense-table',
        Key: {
            "id": {
                "S": id
            },
        }
    };
    const deletePromise = ddb.deleteItem(params).promise().then(data => {
        console.log("DeleteItem succeeded:", JSON.stringify(data, null, 2));
        is_success = true
    })
    await Promise.all([deletePromise])
    return is_success
}