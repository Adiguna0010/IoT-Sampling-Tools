const mysql = require('mysql'); const db = mysql.createConnection({host:'localhost', user:'root', database:'iot_padi'}); db.query('DESCRIBE commands', (err, res) => { console.log(res); db.end(); })
