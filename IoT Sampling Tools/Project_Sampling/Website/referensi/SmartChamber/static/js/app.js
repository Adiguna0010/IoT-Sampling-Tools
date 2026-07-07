let jumlah = 6;

function buatCard(id){

return `

<div class="col-lg-4">

<div class="chamber-card">

<div class="title">

<h4>Chamber ${id}</h4>

<span class="badge-online">

ONLINE

</span>

</div>

<div class="sensor">

🌡 Suhu

<b>${(24+Math.random()*3).toFixed(1)} °C</b>

</div>

<div class="sensor">

💧 Kelembapan

<b>${(50+Math.random()*10).toFixed(0)} %</b>

</div>

<div class="sensor">

☁ Gas Metana

<b>${(2500+Math.random()*300).toFixed(0)} ppm</b>

</div>

<div class="chart"></div>

<div class="switch">

<label>Kipas</label>

<div class="form-check form-switch">

<input class="form-check-input" type="checkbox">

</div>

</div>

<div class="switch">

<label>Syringe</label>

<div class="form-check form-switch">

<input class="form-check-input" type="checkbox">

</div>

</div>

<button class="btn btn-primary btn-detail">

Detail

</button>

</div>

</div>

`;

}

function load(){

let html="";

for(let i=1;i<=jumlah;i++){

html+=buatCard(i);

}

document.getElementById("containerChamber").innerHTML=html;

}

function tambahChamber(){

jumlah++;

document.getElementById("jumlahChamber").innerHTML=jumlah;

document.getElementById("online").innerHTML=jumlah;

load();

}

setInterval(()=>{

const now=new Date();

document.getElementById("clock").innerHTML=

now.toLocaleTimeString();

},1000);

load();