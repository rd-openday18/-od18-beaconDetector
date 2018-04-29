var noble = require('noble');
var RESTClient = require('node-rest-client').Client;
const {auth} = require('google-auth-library');
var os = require('os');
var ifaces = os.networkInterfaces();
var RESTclient = new RESTClient();

// The name for the new topic
const beaconTopicName = 'beaconping';
const gwTopicName = 'gwping';

// Google stuff
var googleClient = null;
var beaconPublishUrl = null;
var gwPublishUrl = null;
async function initGooglePubSub () {
    const projectId = await auth.getDefaultProjectId();
    beaconPublishUrl = `https://pubsub.googleapis.com/v1/projects/${projectId}/topics/${beaconTopicName}:publish`
    gwPublishUrl = `https://pubsub.googleapis.com/v1/projects/${projectId}/topics/${gwTopicName}:publish` 
    console.log ("initGooglePubSub Done")   
}


// Few params
const continuous = true;
const BLEScanPeriod = 20000;
const GWPingPeriod = 5000;
const usePubSub = true;

// GLobal var
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

async function googleAuthenticate() {
    googleClient = await auth.getClient({
      scopes: 'https://www.googleapis.com/auth/pubsub'
    });
    console.log ("googleAuthenticate Done")   

    /*
    const url = `https://www.googleapis.com/dns/v1/projects/${projectId}`;
    const res = await client.request({ url });
    console.log(res.data);
    */
}

 async function BLEDiscovered (peripheral) {
    peripheral.ts = (new Date).getTime();
    if (continuous) {
        beaconpingPOSTargs.data={ 'ts':peripheral.ts.toString(), 'gwid':detectoruuid, 'address':peripheral.address, 'rssi':peripheral.rssi.toString(), 'name':((peripheral.advertisement.localName != undefined) ? peripheral.advertisement.localName: "uknown"), 'txpower':((peripheral.advertisement.txPowerLevel != undefined) ? peripheral.advertisement.txPowerLevel.toString():'unknown')}
        if (!usePubSub) {
            RESTclient.post(beaconpingpostUrl, beaconpingPOSTargs, function(data, response) {
                console.log (JSON.stringify(beaconpingPOSTargs.data))
                console.log(`Beacons reported to backbone (${response.statusCode} ${response.statusMessage})`)          
            })    
        } else {
            try {
                var payload=Buffer.from(JSON.stringify(beaconpingPOSTargs.data)).toString('base64')
                const res = await googleClient.request({ method: 'post', url:beaconPublishUrl, data:{ messages: [ { data: payload} ] } });
                console.log(res.data);
            } catch (e) {
                console.error(e);
            }        //console.log (JSON.stringify(gwpingPOSTargs.data))
        }
    } else {
        beaconDetected.push(peripheral);
        console.log (`${peripheral.id} ${peripheral.rssi} ${peripheral.address} ${peripheral.advertisement.localName} ${peripheral.advertisement.txPowerLevel}`)    
    }
}

async function BLEScanSignatures() {

    if (!continuous) {
        lstBeacon = [];
        if (beaconDetected.length>0) {
            console.log (`Report ${beaconDetected.length} beacons`)
            beaconDetected.forEach(function(aBeacon) {
                lstBeacon.push ({'ts':aBeacon.ts.toString(), 'gwid':detectoruuid, 'address':aBeacon.address, 'rssi':aBeacon.rssi.toString(), 'name':aBeacon.advertisement.localName, 'txpower':aBeacon.advertisement.txPowerLevel.toString()})
            })
            beaconpingPOSTargs.data={'beacons':lstBeacon};
            if (!usePubSub) {            
                RESTclient.post(beaconpingpostUrl, beaconpingPOSTargs, function(data, response) {
                    console.log (JSON.stringify(beaconpingPOSTargs.data))
                    console.log(`Beacons reported to backbone (${response.statusCode} ${response.statusMessage})`)          
                })
            } else {
                try {
                    var payload=Buffer.from(JSON.stringify(beaconpingPOSTargs.data)).toString('base64')
                    const res = await googleClient.request({ method: 'post', url:beaconPublishUrl, data:{ messages: [ { data: payload} ] } });
                    console.log(res.data);
                } catch (e) {
                    console.error(e);
                }        //console.log (JSON.stringify(gwpingPOSTargs.data))
            }
        }    
        setTimeout(BLEScanSignatures, BLEScanPeriod)
    }
    console.log ("(re)Start Beacon Detection")
    beaconDetected = [];
    noble.stopScanning();    
    noble.startScanning([], continuous);    
}

BLEState = function (state) {
    console.log ("BLE State: "+state);
    switch(state) {
        case 'poweredOn':
            if (usePubSub) {
                initGooglePubSub();
                googleAuthenticate()    
            }
            BLEScanSignatures()
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


    if (!usePubSub) {
        gwpingPOSTargs.data={'ts':((new Date).getTime()).toString(), 'gwid':detectoruuid, 'inet':inet};
        RESTclient.post(gwpingpostUrl, gwpingPOSTargs, function(data, response) {
            console.log (JSON.stringify(gwpingPOSTargs.data))
            console.log(`GW Ping reported to backbone (${response.statusCode} ${response.statusMessage})`)          
        })    
    } else {
        gwpingPOSTargs.data={'ts':((new Date).getTime()).toString(), 'gwid':detectoruuid, 'ip':inet[0].ip};
        try {
            var payload=Buffer.from(JSON.stringify(gwpingPOSTargs.data)).toString('base64')
            const res = await googleClient.request({ method: 'post', url:gwPublishUrl, data:{ messages: [ { data: payload} ] } });
            console.log(res.data);
        } catch (e) {
            console.error(e);
        }        //console.log (JSON.stringify(gwpingPOSTargs.data))
    }
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
