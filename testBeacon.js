// Few params
const GWPingPeriod = 5000;

// Env in Dev
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').load();
}

// logger
var winston = require('winston');
winston.level = 'info'
if (process.env.TRACE_LEVEL != undefined) {
    winston.level = process.env.TRACE_LEVEL
}
winston.default.transports.console.timestamp = true;


//dependencies
var noble = require('noble');
var os = require('os');
var async = require("async");
var ifaces = os.networkInterfaces();
var express = require('express');
var app = express();
var advlib = require('advlib');


// GLobal var
var detectoruuid = '';
var inet = [];
var mac = [];
var lastHRT = 0;

 async function BLEDiscovered (peripheral) {
    if (peripheral.advertisement != undefined && peripheral.advertisement.manufacturerData != undefined) {
        res=advlib.ble.data.gap.manufacturerspecificdata.process(peripheral.advertisement.manufacturerData.toString('hex'));
    }
    peripheral.ts = (new Date).getTime();
    var beaconPing= { 'datetime':(peripheral.ts/1000), 'sniffer_addr':mac[0].mac, 'adv_addr':peripheral.address, 'adv_constructor':res.companyName, 'rssi':peripheral.rssi, 'name':((peripheral.advertisement.localName != undefined) ? peripheral.advertisement.localName: "uknown"), 'txpower':((peripheral.advertisement.txPowerLevel != undefined) ? peripheral.advertisement.txPowerLevel.toString():'unknown')}
    winston.log ('debug', JSON.stringify(beaconPing))
}

async function BLEScanSignatures() {
    winston.log ('debug', "Start Beacon Detection")
    noble.startScanning([], true);
}

BLEState = function (state) {
    winston.info ("BLE State: "+state);
    switch(state) {
        case 'poweredOn':
            // At least, start scan one(first) time soon.
            setTimeout (BLEScanSignatures,1000);
            break;
        default:
            noble.stopScanning();
        break;
    }
}

function getId() {
    inet = [];
    mac = [];
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
                mac.push ({mac:iface.mac})
            }
            ++alias;
        });
    });
}

function checkConfig(callback) {
    getId();
    if (process.env.GW_PUBLISH_PERIOD == undefined) {
        callback (false, "GW_PUBLISH_PERIOD is missing")
    } else
    if (process.env.BATCH_MAX_PERIOD == undefined) {
        callback (false, "BATCH_MAX_PEDIOD is missing")
    } else
    if ((process.env.BATCH_MAX_SIZE == undefined)) {
        callback (false, "BATCH_MAX_SIZE is missing")
    } else 
    {
        callback (true, "Let's go");
    }
}
  
checkConfig(function (res, msg) {
    if (res == true) {
        // let'g get platform UUID
        require("machine-uuid")(function(uuid) {
            detectoruuid = uuid;
            winston.info ("BLE Detector unique ID: "+detectoruuid)
            winston.info ("BLE Detector mac ID: "+mac[0].mac)
            // start lstening beacons
            noble.on('discover', BLEDiscovered);
            noble.on('stateChange', BLEState);
        })
    } else {
        winston.error ("Error while checking mandatory params: "+msg)
        process.exit(1);
    }
})
//noble.startScanning();
