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

```sh
export GOOGLE_APPLICATION_CREDENTIALS=<your gcp json file>
node main.js
```
