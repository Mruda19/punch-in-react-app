import React,{useState,useEffect} from "react"

function App(){

const [history,setHistory] = useState([])
const [project,setProject] = useState("")
const [notes,setNotes] = useState("")
const [time,setTime] = useState("")

useEffect(()=>{
setCurrentTime()
loadHistory()
},[])

function setCurrentTime(){

const now = new Date()

setTime(now.toLocaleTimeString())

}

async function punch(type){

await fetch("/punch",{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({

type,
time,
project,
notes

})

})

loadHistory()

}

async function loadHistory(){

const res = await fetch("/history")

const data = await res.json()

setHistory(data)

}

return(

<div style={{maxWidth:"700px",margin:"auto"}}>

<h2>Welcome to Punch Clock</h2>

<p>Track your Punch In and Punch Out</p>

<h3>Add Details</h3>

<input
placeholder="Project Code"
value={project}
onChange={e=>setProject(e.target.value)}
/>

<br/>

<textarea
placeholder="Notes"
value={notes}
onChange={e=>setNotes(e.target.value)}
/>

<h3>Manual Time</h3>

<input
value={time}
onChange={e=>setTime(e.target.value)}
/>

<br/><br/>

<button onClick={()=>punch("IN")}>
Punch In
</button>

<button onClick={()=>punch("OUT")}>
Punch Out
</button>

<h3>History</h3>

<table border="1">

<thead>
<tr>
<th>Type</th>
<th>Time</th>
<th>Project</th>
<th>Notes</th>
</tr>
</thead>

<tbody>

{history.map((h)=>(
<tr key={h.id}>
<td>{h.type}</td>
<td>{h.time}</td>
<td>{h.project || "-"}</td>
<td>{h.notes || "-"}</td>
</tr>
))}

</tbody>

</table>

</div>

)

}

export default App