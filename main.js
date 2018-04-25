//change3
var noble = require('noble');
var RESTClient = require('node-rest-client').Client;
var os = require('os');
var ifaces = os.networkInterfaces();

var RESTclient = new RESTClient();

const BLEScanPeriod = 20000;
const GWPingPeriod = 5000;
var detectoruuid = '';
var inet = [];

const Auth = "Basic c29sYWNlLWNsb3VkLWNsaWVudDpodWZuYXVsMTdhaG1hMGc2amY0MTE1cnRuaA=="
const beaconpingpostUrl = "http://mr-xy4p60ezz.messaging.solace.cloud:20298/TOPIC/beaconping"
const gwpingpostUrl = "http://mr-xy4p60ezz.messaging.solace.cloud:20298/TOPIC/gwping"

var beaconDetected = [];
// set content-type header and data as json in args parameter 
var beaconpingPOSTargs = {
    data: { },
    headers: { "Content-Type": "application/json", "Authorization" : Auth}
};

var gwpingPOSTargs = {
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
        beaconpingPOSTargs.data={'beacons':lstBeacon};
        RESTclient.post(beaconpingpostUrl, beaconpingPOSTargs, function(data, response) {
            console.log (JSON.stringify(beaconpingPOSTargs.data))
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

GWPing = function () {

    inet = [];
    Object.keys(ifaces).forEach(function (ifname) {
        var alias = 0;
        
        ifaces[ifname].forEach(function (iface) {
            if ('IPv4' !== iface.family || iface.internal !== false) {
            // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
            return;
            }
        
            if (alias >= 1) {
            } else {
            // this interface has only one ipv4 adress
            inet.push ({'ip':iface.address})
            }
            ++alias;
        });
    });

    gwpingPOSTargs.data={'gwid':detectoruuid, 'inet':inet};

    RESTclient.post(gwpingpostUrl, gwpingPOSTargs, function(data, response) {
        console.log (JSON.stringify(gwpingPOSTargs.data))
        console.log(`GW Ping reported to backbone (${response.statusCode} ${response.statusMessage})`)          
    })
    setTimeout(GWPing, GWPingPeriod)    
}

noble.on('discover', BLEDiscovered);
noble.on('stateChange', BLEState);

require("machine-uuid")(function(uuid) {
    detectoruuid = uuid;
    console.log ("BLE Detector unique ID: "+detectoruuid)
    GWPing();
})

//noble.startScanning();
