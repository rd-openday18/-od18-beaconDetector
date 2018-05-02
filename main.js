// Few params
const GWPingPeriod = 5000;

// Env in Dev
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').load();
}

//dependencies
var noble = require('noble');
const {auth} = require('google-auth-library');
var os = require('os');
var async = require("async");
var ifaces = os.networkInterfaces();
var express = require('express');
var app = express();

// GLobal var
var detectoruuid = '';
var stats = {
  maxpending : 0,
  published_success : 0,
  published_failure : 0,
  'window': {
    period: process.env.GW_PUBLISH_PERIOD,
    maxpending : 0,
    published_success : 0,
    published_failure : 0  
  }
};
var lastStats = stats;


// Google stuff
var googleClient = null;
var beaconPublishUrl = null;
var gwPublishUrl = null;
async function initGooglePubSub () {
    const projectId = await auth.getDefaultProjectId();
    const baseUrlPublish = `https://pubsub.googleapis.com/v1/projects/${projectId}/topics`;
    beaconPublishUrl = `${baseUrlPublish}/${process.env.BEACON_DISCOVERY_TOPIC_NAME}:publish`
    gwPublishUrl = `${baseUrlPublish}/${process.env.GW_DISCOVERY_TOPIC_NAME}:publish`
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
            stats.published_success++;
            stats.window.published_success++;
            if (callback!=undefined) {callback({status:true, result:rest})};
        });
    } catch (e) {
        stats.published_failure++;
        stats.window.published_failure++;
        console.log (e);
        if (callback!=undefined) {callback({status:true, result:e})};
    }
}, 2);

googlePublishQueue.drain = function() {
    //console.log('All beacons AD have been published');
}

googlePublishQueue.saturated = function() {
    //console.log('Worker queue saturated '+googlePublishQueue.length());
    stats.maxpending=Math.max(stats.maxpending, googlePublishQueue.length());
    stats.window.maxpending=Math.max(stats.window.maxpending, googlePublishQueue.length());
}

function resetWindowedStats ()
{
    lastStats = JSON.parse(JSON.stringify(stats));
    stats.window.maxpending=0;
    stats.window.published_success=0;
    stats.window.published_failure=0;
}

function beaconPublished (err) {
    if (err.status == false) {
        console.log ("Google pubsub return error "+err.result)
    } else {
        // console.log ("Beacon published "+JSON.stringify (err.result.data))
    }
}
 async function BLEDiscovered (peripheral) {
    peripheral.ts = (new Date).getTime();
    var beaconPing={ 'ts':peripheral.ts.toString(), 'gwid':detectoruuid, 'address':peripheral.address, 'rssi':peripheral.rssi.toString(), 'name':((peripheral.advertisement.localName != undefined) ? peripheral.advertisement.localName: "uknown"), 'txpower':((peripheral.advertisement.txPowerLevel != undefined) ? peripheral.advertisement.txPowerLevel.toString():'unknown')}
    var payload=Buffer.from(JSON.stringify(beaconPing)).toString('base64')
    googlePublishQueue.push ([{payload :payload}], beaconPublished);
}

async function BLEScanSignatures() {
    //console.log ("Start Beacon Detection")
    if (process.env.CONTINUOUS_SCAN == 'false') {
        // We are in batch mode, let's publish stats when scan batch is completed.
        GWPing();
    }
    noble.stopScanning();
    noble.startScanning([], (process.env.CONTINUOUS_SCAN=='true')?true:false);
}

BLEState = function (state) {
    console.log ("BLE State: "+state);
    switch(state) {
        case 'poweredOn':
            initGooglePubSub();
            googleAuthenticate()
            if (process.env.CONTINUOUS_SCAN == 'false') {
                // Scan by batch, repeat scan procedure each period
                console.log (`Mode : Batch (${process.env.SCAN_PERIOD})`)
                setInterval(BLEScanSignatures, process.env.SCAN_PERIOD)
            } else {
                // continuous scan mode
                console.log ("Mode : Continuous")
            }
            // At least, start scan one(first) time soon.
            setTimeout (BLEScanSignatures,1000);
            break;
        default:
            noble.stopScanning();
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


    gwping={'ts':((new Date).getTime()).toString(), 'gwid':detectoruuid, 'ip':inet[0].ip, 'stats':JSON.stringify(stats)};
    resetWindowedStats();
    //console.log (gwping)
    try {
        var payload=Buffer.from(JSON.stringify(gwping)).toString('base64')
        const res = await googleClient.request({ method: 'post', url:gwPublishUrl, data:{ messages: [ { data: payload} ] } });
        //console.log ("GW ID published "+JSON.stringify (res.data))
    } catch (e) {
        console.error(e);
    }   //console.log (JSON.stringify(gwpingPOSTargs.data))
}

function checkConfig(callback) {
    if (process.env.BEACON_DISCOVERY_TOPIC_NAME == undefined) {
        callback (false, "BEACON_DISCOVERY_TOPIC_NAME is missing")
    } else
    if (process.env.GW_DISCOVERY_TOPIC_NAME == undefined) {
        callback (false, "GW_DISCOVERY_TOPIC_NAME is missing")
    } else
    if (process.env.GW_PUBLISH_PERIOD == undefined) {
        callback (false, "GW_PUBLISH_PERIOD is missing")
    } else
    if (process.env.CONTINUOUS_SCAN == undefined) {
        callback (false, "CONTINUOUS_SCAN is missing")
    } else
    if ((process.env.CONTINUOUS_SCAN == 'false') && (process.env.SCAN_PERIOD == undefined)) {
        callback (false, "SCAN_PERIOD is missing")
    } else 
    {
        callback (true, "Let's go");
    }
}

var server = app.listen(3001, 'localhost', function() {
    console.log("... port %d in %s mode", server.address().port, app.settings.env);
});

app.get('/status', function(req, res) {
    res.send(JSON.stringify(lastStats));
  });

  
checkConfig(function (res, msg) {
    if (res == true) {
        // let'g get platform UUID
        require("machine-uuid")(function(uuid) {
            detectoruuid = uuid;
            console.log ("BLE Detector unique ID: "+detectoruuid)
            // Start regular publish of gw identity
            if (process.env.CONTINUOUS_SCAN == 'true') {
                stats.window.period = process.env.GW_PUBLISH_PERIOD;
                setInterval (GWPing, process.env.GW_PUBLISH_PERIOD);
            } else {
                stats.window.period = process.env.SCAN_PERIOD;
            }
            // start lstening beacons
            noble.on('discover', BLEDiscovered);
            noble.on('stateChange', BLEState);
        })
    } else {
        console.log ("Error while checking mandatory params: "+msg)
        process.exit(1);
    }
})
//noble.startScanning();
