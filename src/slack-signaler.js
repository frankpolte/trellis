var RtmClient = require('@slack/client').RtmClient;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;

var bot_token = process.env.SLACK_BOT_TOKEN || '';

let rtm;// = new RtmClient(bot_token);

var UUID = (function() {
  var self = {};
  var lut = []; for (var i=0; i<256; i++) { lut[i] = (i<16?'0':'')+(i).toString(16); }
  self.generate = function() {
    var d0 = Math.random()*0xffffffff|0;
    var d1 = Math.random()*0xffffffff|0;
    var d2 = Math.random()*0xffffffff|0;
    var d3 = Math.random()*0xffffffff|0;
    return lut[d0&0xff]+lut[d0>>8&0xff]+lut[d0>>16&0xff]+lut[d0>>24&0xff]+'-'+
      lut[d1&0xff]+lut[d1>>8&0xff]+'-'+lut[d1>>16&0x0f|0x40]+lut[d1>>24&0xff]+'-'+
      lut[d2&0x3f|0x80]+lut[d2>>8&0xff]+'-'+lut[d2>>16&0xff]+lut[d2>>24&0xff]+
      lut[d3&0xff]+lut[d3>>8&0xff]+lut[d3>>16&0xff]+lut[d3>>24&0xff];
  }
  return self;
})();

function init(config) {
  let HANDLERS = { hello: () => {}, reply: () => {}, offer: () => {}, error: () => {} }
  let CHANNEL;
  let USER_ID = UUID.generate()
  let DOC_ID;
  let last_ts

  rtm = new RtmClient(config.bot_token);
  DOC_ID = config.doc_id

  // The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
  rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
    for (const c of rtmStartData.channels) {
      if (c.is_member && c.name ==='signals') { CHANNEL = c.id }
    }
    console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}`);
  });

  // you need to wait for the client to fully connect before you can send messages
  rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
    let msg = JSON.stringify({ action: "hello", user:USER_ID, doc_id:DOC_ID })
    rtm.sendMessage(msg, CHANNEL);
  });

  //rtm.on(CLIENT_EVENTS.RTM.MESSAGE, function handleRtmMessage(message) {
  rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message) {
    let ts = parseFloat(message.ts)
    if (last_ts && last_ts > ts) console.log("WARNING - TS OUT OF ORDER")
    console.log('Message:', message);
    try {
      let msg = JSON.parse(message.text)
      if (msg.user != USER_ID) {
        if (msg.doc_id == DOC_ID) {
          if (msg.action == "hello") {
            HANDLERS['hello'](msg.user, (reply) => {
                let msgJSON = JSON.stringify({ action: "offer", user:USER_ID, doc_id:DOC_ID, to:msg.user, body:reply})
                rtm.sendMessage(msgJSON, CHANNEL);
            })
          }
          if (msg.action == "offer" && msg.to == USER_ID) {
            HANDLERS['offer'](msg.user, msg.body, (reply) => {
                let msgJSON = JSON.stringify({ action: "reply", user:USER_ID, doc_id:DOC_ID, to:msg.user, body:reply})
                rtm.sendMessage(msgJSON, CHANNEL);
            })
          }
          if (msg.action == "reply" && msg.to == USER_ID) {
            HANDLERS['reply'](msg.user, msg.body)
          }
        } else {
          console.log("Message about a document other than the one we're managing - ignore")
        }
      } else {
        console.log("Message was by me...")
      }
    } catch(e) {
      console.log("Was a non-json message - ignore")
      HANDLERS['error'](message,e)
    }
    last_ts = ts
    console.log("Done processing message")
  });
  return { 
    on: (type,handler) => { HANDLERS[type] = handler },
    start: () => { rtm.start() },
    stop: () => { rtm.stop() }
  }
}

module.exports = {
  init
}
