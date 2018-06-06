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
const {auth} = require('google-auth-library');
var os = require('os');
var async = require("async");
var ifaces = os.networkInterfaces();
var express = require('express');
var app = express();
var advlib = require('advlib');

const http = require('http');
const https = require('https');


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
var lastStats = JSON.parse(JSON.stringify(stats));
var inet = [];
var mac = [];
var beaconPubMsgs = [];
var lastHRT = 0;

// Google stuff
var googleClientBeacon = null;
var googleClientGw = null;
var beaconPublishUrl = null;
var gwPublishUrl = null;
async function initGooglePubSub () {
    const projectId = await auth.getDefaultProjectId();
    const baseUrlPublish = `https://pubsub.googleapis.com/v1/projects/${projectId}/topics`;
    beaconPublishUrl = `${baseUrlPublish}/${process.env.BEACON_DISCOVERY_TOPIC_NAME}:publish`
    gwPublishUrl = `${baseUrlPublish}/${process.env.GW_DISCOVERY_TOPIC_NAME}:publish`
    winston.info ("Google PubSub : URL init Done")
}

async function googleAuthenticate() {
    googleClientBeacon = await auth.getClient({
      scopes: 'https://www.googleapis.com/auth/pubsub'
    });
    googleClientGw = await auth.getClient({
        scopes: 'https://www.googleapis.com/auth/pubsub'
      });
      winston.info ("Google PubSub : Authentication Done")
}

async function gcpPublish (payload) {
    const rest = null;
    try {
        winston.debug("Sending POST request")
        const rest = await googleClientBeacon.request({ method: 'post', 
            url:beaconPublishUrl, 
            data:{ messages: payload }, 
            httpAgent: new http.Agent({ keepAlive: true }), 
            httpsAgent: new https.Agent({ keepAlive: true })
        });
        return ({status:true, result:rest});
    } catch(e) {
        return ({status:false, result:e});
     }
}

var googlePublishQueue = {}
function startQueue (nbWorker) {
    googlePublishQueue = async.queue(function (task, callback) {
        try {
            gcpPublish(task.payload).then(function(rest) {
                if (rest.status == false) {
                    stats.published_failure+=task.nbmsg;
                    stats.window.published_failure+=task.nbmsg;
                    if (callback!=undefined) {callback({status:false, result:rest.result})};    
                } else {
                    stats.published_success+=task.nbmsg;
                    stats.window.published_success+=task.nbmsg;
                    if (callback!=undefined) {callback({status:true, result:rest.result})};    
                }
            });
        } catch (e) {
            stats.published_failure+=task.nbmsg;
            stats.window.published_failure+=task.nbmsg;
            console.log (e);
            if (callback!=undefined) {callback({status:true, result:e})};
        }
    }, nbWorker);
    // Hack
    process.env.UV_THREADPOOL_SIZE = nbWorker
}

googlePublishQueue.drain = function() {
    winston.log('debug', 'All beacons AD have been published');
}

googlePublishQueue.saturated = function() {
    stats.maxpending=Math.max(stats.maxpending, googlePublishQueue.length());
    stats.window.maxpending=Math.max(stats.window.maxpending, googlePublishQueue.length());
}

function resetWindowedStats ()
{
    winston.log ('debug', JSON.stringify(stats));
    lastStats = JSON.parse(JSON.stringify(stats));
    stats.window.maxpending=0;
    stats.window.published_success=0;
    stats.window.published_failure=0;
}

function beaconPublished (err) {
    if (err.status == false) {
        winston.error ("Google pubsub return error "+err.result)
    } else {
        winston.log ('debug', "Beacon published ("+JSON.stringify (err.result.data.messageIds.length)+" ack received)")
    }
}
 async function BLEDiscovered (peripheral) {
    currentHRT = process.hrtime()[0];
    if (peripheral.advertisement != undefined && peripheral.advertisement.manufacturerData != undefined) {
        res=advlib.ble.data.gap.manufacturerspecificdata.process(peripheral.advertisement.manufacturerData.toString('hex'));
    }
    peripheral.ts = (new Date).getTime();
    var beaconPing= { 'datetime':(peripheral.ts/1000), 'sniffer_addr':mac[0].mac, 'adv_addr':peripheral.address, 'adv_constructor':res.companyName, 'rssi':peripheral.rssi, 'name':((peripheral.advertisement.localName != undefined) ? peripheral.advertisement.localName: "uknown"), 'txpower':((peripheral.advertisement.txPowerLevel != undefined) ? peripheral.advertisement.txPowerLevel.toString():'unknown')}
    var payload=Buffer.from(JSON.stringify(beaconPing)).toString('base64')
    beaconPubMsgs.push ({ data:payload});
    if (((currentHRT  - lastHRT) >= process.env.BATCH_MAX_PERIOD) || (beaconPubMsgs.length>=process.env.BATCH_MAX_SIZE)) {
        winston.log('debug', 'Push beacons msg to queue ('+googlePublishQueue.length()+' pending)')
        googlePublishQueue.push ([{payload :[...beaconPubMsgs], nbmsg: beaconPubMsgs.length}], beaconPublished);
        stats.window.period = currentHRT  - lastHRT;
        GWPing();
        beaconPubMsgs=[];
        lastHRT = currentHRT;
    }
}

async function BLEScanSignatures() {
    winston.log ('debug', "Start Beacon Detection")
    lastHRT = process.hrtime()[0];
    noble.startScanning([], true);
}

BLEState = function (state) {
    winston.info ("BLE State: "+state);
    switch(state) {
        case 'poweredOn':
            initGooglePubSub();
            googleAuthenticate()
            // At least, start scan one(first) time soon.
            setTimeout (BLEScanSignatures,1000);
            break;
        default:
            noble.stopScanning();
        break;
    }
}

 async function GWPing () {
    resetWindowedStats();
    gwping={'datetime':((new Date).getTime())/1000, 'sniffer_addr':mac[0].mac, 'ip':inet[0].ip, 'stats':lastStats};
    //console.log (gwping)
    try {
        var payload=Buffer.from(JSON.stringify(gwping)).toString('base64')
        const res = await googleClientGw.request({ method: 'post', 
            url:gwPublishUrl, 
            data:{ messages: [ { data: payload} ] },
            httpAgent: new http.Agent({ keepAlive: true }), 
            httpsAgent: new https.Agent({ keepAlive: true })
         });
        winston.log ('debug', "GW ID published "+JSON.stringify (res.data))
    } catch (e) {
        console.error(e);
    }   //console.log (JSON.stringify(gwpingPOSTargs.data))
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
    if (process.env.BEACON_DISCOVERY_TOPIC_NAME == undefined) {
        callback (false, "BEACON_DISCOVERY_TOPIC_NAME is missing")
    } else
    if (process.env.GW_DISCOVERY_TOPIC_NAME == undefined) {
        callback (false, "GW_DISCOVERY_TOPIC_NAME is missing")
    } else
    if (process.env.GW_PUBLISH_PERIOD == undefined) {
        callback (false, "GW_PUBLISH_PERIOD is missing")
    } else
    if (process.env.BATCH_MAX_PERIOD == undefined) {
        callback (false, "BATCH_MAX_PEDIOD is missing")
    } else
    if ((process.env.BATCH_MAX_SIZE == undefined)) {
        callback (false, "BATCH_MAX_SIZE is missing")
    } else 
    if (process.env.PUBLISH_MAX_WORKER == undefined) {
        callback (false, "PUBLISH_MAX_WORKER is missing")
    } else
    {
        callback (true, "Let's go");
    }
}

var server = app.listen(3001, 'localhost', function() {
    winston.info("... port %d in %s mode", server.address().port, app.settings.env);
});

app.get('/status', function(req, res) {
    res.send(JSON.stringify(lastStats));
  });

  
checkConfig(function (res, msg) {
    if (res == true) {
        startQueue(process.env.PUBLISH_MAX_WORKER)
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
