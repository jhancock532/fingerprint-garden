/*
export class Server {
  constructor(){
    Backendless.serverURL = API_HOST;
    Backendless.initApp(APP_ID, API_KEY);

    const channel = Backendless.Messaging.subscribe('default');

    const onMessage = message => {
      //console.log(message.message);
      let participantObject = JSON.parse(message.message);
    
      if (message.subtopic == "NEW PARTICIPANT"){
    
        if (participantID != participantObject.id) {
          participantManager.generateNewParticipant(participantObject.id, participantObject.hash, false);
        }
      }
    
      if (message.subtopic == "PRESENT"){
        if (participantManager.participantIsPresent(participantObject.id)){
          participantManager.resetParticipantTimeToLive(participantObject.id);
        } else {
          participantManager.generateNewParticipant(participantObject.id, participantObject.hash, false);
        }
      }
    }

    channel.addMessageListener(onMessage);
  }


  





setInterval(function sendPresenceSignal(){
  let participantObject = {
    "id": participantID,
    "hash": participantHash
  }

  const request = Backendless.Messaging.publish('default', JSON.stringify(participantObject), {subtopic: "PRESENT"});
}, 800),





const ghostParticipants = Backendless.Data.of('ghostParticipants');
ghostParticipants.find(Backendless.DataQueryBuilder.create().setPageSize(100).setSortBy('created'))
.then(result => { 
  ghostParticipantList = result;
  console.log("GOT GHOST PARTICIPANTS: ", ghostParticipantList); 
  
  loadedGhostParticipantList = true;
});

function addParticipantToDatabase(participantHash) {
  ghostParticipants.save({ hash: participantHash })
    .then(function (object) {
      console.log("SAVE SUCCESSFUL: ", object)
    })
    .catch(function (error) {
      console.error("SAVE UNSUCCESSFUL: ", error.message)
      throw error;
    });
}

}
*/