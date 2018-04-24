var noble = require('noble');
var RESTClient = require('node-rest-client').Client;

var RESTclient = new RESTClient();

const BLEScanPeriod = 20000;
var detectoruuid = '';
const Auth = "Basic c29sYWNlLWNsb3VkLWNsaWVudDpodWZuYXVsMTdhaG1hMGc2amY0MTE1cnRuaA=="
const postUrl = "http://mr-xy4p60ezz.messaging.solace.cloud:20298/TOPIC/beaconping"

var beaconDetected = [];
// set content-type header and data as json in args parameter 
var POSTargs = {
    data: { },
    headers: { "Content-Type": "application/json", "Authorization" : Auth}
};


BLEDiscovered = function(peripheral) {
    beaconDetected.push(peripheral);
    console.log (`${peripheral.id} ${peripheral.rssi} ${peripheral.address} ${peripheral.advertisement.localName} ${peripheral.advertisement.txPowerLevel}`)
}

BLEScanSignatures = function() {
    lstBeacon = [];
    if (beaconDetected.length>0) {
        console.log (`Report ${beaconDetected.length} beacons`)
        beaconDetected.forEach(function(aBeacon) {
            lstBeacon.push ({'gwid':detectoruuid, 'address':aBeacon.address, 'rssi':aBeacon.rssi, 'name':aBeacon.advertisement.localName, 'txpower':aBeacon.advertisement.txPowerLevel})
        })
        POSTargs.data={'beacons':lstBeacon};
        RESTclient.post(postUrl, POSTargs, function(data, response) {
            console.log (JSON.stringify(POSTargs.data))
            console.log(`Beacons reported to backbone (${response.statusCode} ${response.statusMessage})`)          
        })
    }
    console.log ("(re)Start Beacon Detection")
    beaconDetected = [];
    noble.stopScanning();    
    noble.startScanning();    
    setTimeout(BLEScanSignatures, BLEScanPeriod)
}

BLEState = function (state) {
    console.log ("BLE State: "+state);
    switch(state) {
        case 'poweredOn':
            BLEScanSignatures()
            break;
        default:

        break;
    }
}

noble.on('discover', BLEDiscovered);
noble.on('stateChange', BLEState);

require("machine-uuid")(function(uuid) {
    detectoruuid = uuid;
    console.log ("BLE Detector unique ID: "+detectoruuid)
})

//noble.startScanning();
