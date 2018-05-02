# Beacon Detector
This simple program detects and reports continuously Bleutooth Low Energy (BLE) advertisements to Google PubSub topic.
It also reports itself every 5 sec (as a beacon gateway) to another topics in order to have a minimalistic monitoring solution of the detector itself.
(BLE Advertisement are usually sent by Beacon/Tag but also by some smartphones/headset/...)

This program do not use full Google Cloud Platform SDK because of targeted platform (a Raspberry PI Zero/arm6)
Google Authentication lib is used then raw REST API call are used.

WIP

# Installation
```sh
npm install
```

# usage
this program is intend to be used with google PubSub. You will need to setup a service account and download the service account json key file then setup GOOGLE_APPLICATION_CREDENTIALS accordingly. [Check Google page on authentication](https://cloud.google.com/docs/authentication/)
Other env variable to consider :
GW_PUBLISH_PERIOD : period to publish gw status (in ms)
BEACON_DISCOVERY_TOPIC_NAME : google pubsub topic name to use to publish beacon advertisements
GW_DISCOVERY_TOPIC_NAME : google pubsub topic name to use to publish gateway status
CONTINUOUS_SCAN : scan mode:
    true : continuous scan (each BLE advertisement received is published instantaneously),
    false: batch mode : gateway publishes detected beacons only once per beacon in a given recurrent period
SCAN_PERIOD : scan period when working in batch mode (in ms)


```sh
export GOOGLE_APPLICATION_CREDENTIALS=<your gcp json file>
node main.js
```
