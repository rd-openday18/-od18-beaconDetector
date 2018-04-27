var noble = require('noble');
var RESTClient = require('node-rest-client').Client;
var os = require('os');
var ifaces = os.networkInterfaces();
var RESTclient = new RESTClient();

const PubSub = require('@google-cloud/pubsub');
const projectId = 'geotag-200012';
const pubsub = new PubSub();

// The name for the new topic
const beaconTopicName = 'beaconping';
const gwTopicName = 'gwping';


// Few params
const continuous = true;
const BLEScanPeriod = 20000;
const GWPingPeriod = 5000;
const usePubSub = true;

// PubSub init
var pubsubClient = null;
if (usePubSub) {
    // Instantiates a client
    pubsubClient = new PubSub({
    projectId: projectId,
  });
}


const beaconTopic = pubsub.topic(beaconTopicName);
const gwTopic = pubsub.topic(gwTopicName);
const beaconPublisher = beaconTopic.publisher();
const gwPublisher = gwTopic.publisher();
const beaconData = Buffer.from('Beacon Signature Trace');
const gwData = Buffer.from('GW Signature Trace');

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


BLEDiscovered = function(peripheral) {
    peripheral.ts = (new Date).getTime();
    if (continuous) {
        beaconpingPOSTargs.data={ 'ts':peripheral.ts.toString(), 'gwid':detectoruuid, 'address':peripheral.address, 'rssi':peripheral.rssi.toString(), 'name':((peripheral.advertisement.localName != undefined) ? peripheral.advertisement.localName: "uknown"), 'txpower':((peripheral.advertisement.txPowerLevel != undefined) ? peripheral.advertisement.txPowerLevel.toString():'unknown')}
        if (!usePubSub) {
            RESTclient.post(beaconpingpostUrl, beaconpingPOSTargs, function(data, response) {
                console.log (JSON.stringify(beaconpingPOSTargs.data))
                console.log(`Beacons reported to backbone (${response.statusCode} ${response.statusMessage})`)          
            })    
        } else {
            //console.log (beaconpingPOSTargs.data)
            beaconPublisher.publish(beaconData, beaconpingPOSTargs.data, function(err, messageId) {
                if (err) {
                    // Error handling omitted.
                    console.log ("PubSub error "+err);
                  } else {
                    console.log(`Beacons reported to pubsub`)                                
                  }           
            });    
        }
    } else {
        beaconDetected.push(peripheral);
        console.log (`${peripheral.id} ${peripheral.rssi} ${peripheral.address} ${peripheral.advertisement.localName} ${peripheral.advertisement.txPowerLevel}`)    
    }
}

BLEScanSignatures = function() {

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
                beaconPublisher.publish(beaconData,beaconpingPOSTargs.data, function(err, messageId) {
                    if (err) {
                        // Error handling omitted.
                        console.log ("PubSub error "+err);
                      }  else {
                        console.log(`Beacons reported to pubsub`)                                
                      }            
                });    
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


    if (!usePubSub) {
        gwpingPOSTargs.data={'ts':((new Date).getTime()).toString(), 'gwid':detectoruuid, 'inet':inet};
        RESTclient.post(gwpingpostUrl, gwpingPOSTargs, function(data, response) {
            console.log (JSON.stringify(gwpingPOSTargs.data))
            console.log(`GW Ping reported to backbone (${response.statusCode} ${response.statusMessage})`)          
        })    
    } else {
        gwpingPOSTargs.data={'ts':((new Date).getTime()).toString(), 'gwid':detectoruuid, 'ip':inet[0].ip};
        //console.log (JSON.stringify(gwpingPOSTargs.data))
        gwPublisher.publish(gwData, gwpingPOSTargs.data, function(err, messageId) {
            if (err) {
                // Error handling omitted.
                console.log ("PubSub error "+err);
              } else {
                console.log(`GW Ping reported to pubsub`)          
              }           
        });    
    }
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
