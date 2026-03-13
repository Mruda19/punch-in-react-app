const express = require("express")
const bodyParser = require("body-parser")
const path = require("path")
const db = require("./couchbase")

const app = express()

app.use(bodyParser.json())

/* SAVE PUNCH */

app.post("/punch", async (req,res)=>{

const {type,time,project,notes} = req.body

const collection = await db.collection()

const id = Date.now().toString()

await collection.insert(id,{
type,
time,
project,
notes
})

res.send({message:"saved"})

})


/* GET HISTORY */

app.get("/history", async(req,res)=>{

const cluster = await db.cluster()

const query = `
SELECT META().id,type,time,project,notes
FROM \`${process.env.COUCHBASE_BUCKET}\`
ORDER BY META().id DESC
`

const result = await cluster.query(query)

res.send(result.rows)

})


/* SERVE REACT BUILD */

app.use(express.static(path.join(__dirname,"client/build")))

app.get("*",(req,res)=>{
res.sendFile(path.join(__dirname,"client/build/index.html"))
})

const port = process.env.PORT || 3000

app.listen(port,()=>{
console.log("server started")
})