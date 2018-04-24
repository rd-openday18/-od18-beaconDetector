var noble = require('noble');
const BLEScanPeriod = 20000;

BLEDiscovered = function(peripheral) {
    console.log (`${peripheral.id} ${peripheral.rssi} ${peripheral.address} ${peripheral.advertisement.localName} ${peripheral.advertisement.txPowerLevel}`)
}

BLEScanSignatures = function() {
    console.log ("BLE Start Scanning");
    noble.stopScanning();    
    noble.startScanning();    
    setInterval(BLEScanSignatures, BLEScanPeriod)
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


//noble.startScanning();
