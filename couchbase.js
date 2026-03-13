const couchbase = require("couchbase")

let cluster

async function connect(){

if(!cluster){

cluster = await couchbase.connect(
process.env.COUCHBASE_CONNECTION_STRING,
{
username:process.env.COUCHBASE_USERNAME,
password:process.env.COUCHBASE_PASSWORD
}
)

}

return cluster
}

exports.cluster = async()=>{
return await connect()
}

exports.collection = async()=>{

const c = await connect()

const bucket = c.bucket(process.env.COUCHBASE_BUCKET)

return bucket.defaultCollection()

}