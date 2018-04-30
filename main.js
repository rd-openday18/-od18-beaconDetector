// Few params
const GWPingPeriod = 5000;

//dependencies
var noble = require('noble');
const {auth} = require('google-auth-library');
var os = require('os');
var async = require("async");
var ifaces = os.networkInterfaces();

// GLobal var
var detectoruuid = '';
var inet = [];

// Const
const beaconTopicName = 'beaconping';
const gwTopicName = 'gwping';

// Google stuff
var googleClient = null;
var beaconPublishUrl = null;
var gwPublishUrl = null;
async function initGooglePubSub () {
    const projectId = await auth.getDefaultProjectId();
    const baseUrlPublish = `https://pubsub.googleapis.com/v1/projects/${projectId}/topics`;
    beaconPublishUrl = `${baseUrlPublish}/${beaconTopicName}:publish`
    gwPublishUrl = `${baseUrlPublish}/${gwTopicName}:publish` 
    console.log ("Google PubSub : URL init Done")   
}

async function googleAuthenticate() {
    googleClient = await auth.getClient({
      scopes: 'https://www.googleapis.com/auth/pubsub'
    });
    console.log ("Google PubSub : Authentication Done")   
}

async function gcpPublish (payload) {
    const rest = await googleClient.request({ method: 'post', url:beaconPublishUrl, data:{ messages: [ { data: payload} ] } });
    return rest;
}

var googlePublishQueue = async.queue(function (task, callback) {
    try {
        gcpPublish(task.payload).then(function(rest) {
            if (callback!=undefined) {callback({status:true, result:rest})};
        });
    } catch (e) {
        console.log (e);
        if (callback!=undefined) {callback({status:true, result:e})};
    } 
}, 2);

googlePublishQueue.drain = function() {
    console.log('All beacons AD have been published');
}

function beaconPublished (err) {
    if (err.status == false) {
        console.log ("Google pubsub return error "+err.result)
    } else {
        console.log ("Beacon published "+JSON.stringify (err.result.data))
    }
} 
 async function BLEDiscovered (peripheral) {
    peripheral.ts = (new Date).getTime();
    var beaconPing={ 'ts':peripheral.ts.toString(), 'gwid':detectoruuid, 'address':peripheral.address, 'rssi':peripheral.rssi.toString(), 'name':((peripheral.advertisement.localName != undefined) ? peripheral.advertisement.localName: "uknown"), 'txpower':((peripheral.advertisement.txPowerLevel != undefined) ? peripheral.advertisement.txPowerLevel.toString():'unknown')}
    var payload=Buffer.from(JSON.stringify(beaconPing)).toString('base64')
    googlePublishQueue.push ([{payload :payload}], beaconPublished);
}

async function BLEScanSignatures() {
    console.log ("Start Beacon Detection")
    noble.stopScanning();    
    noble.startScanning([], true);    
}

BLEState = function (state) {
    console.log ("BLE State: "+state);
    switch(state) {
        case 'poweredOn':
            initGooglePubSub();
            googleAuthenticate()    
            setTimeout (BLEScanSignatures,5000);
            break;
        default:
        break;
    }
}

 async function GWPing () {

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


    gwping={'ts':((new Date).getTime()).toString(), 'gwid':detectoruuid, 'ip':inet[0].ip};
    try {
        var payload=Buffer.from(JSON.stringify(gwping)).toString('base64')
        const res = await googleClient.request({ method: 'post', url:gwPublishUrl, data:{ messages: [ { data: payload} ] } });
        console.log ("GW ID published "+JSON.stringify (res.data))
    } catch (e) {
        console.error(e);
    }        //console.log (JSON.stringify(gwpingPOSTargs.data))
    setTimeout(GWPing, GWPingPeriod)    
}

noble.on('discover', BLEDiscovered);
noble.on('stateChange', BLEState);

require("machine-uuid")(function(uuid) {
    detectoruuid = uuid;
    console.log ("BLE Detector unique ID: "+detectoruuid)
    setTimeout (GWPing, GWPingPeriod);
})

//noble.startScanning();
