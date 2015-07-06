Meteor server application that is used to launch a Famous Framework application that uses a DDP 
protocol component to connect back to the server. The Framework app is a simple Chat 
scroll list that demonstrates the use of DDP to 'watch' Meteor collections and update it's data in real time.

This Meteor application is interesting in that it uses server side routing to allow a client to run the Framework
application by specifying a unqiue URL for launching the client. The Framework application is actually only two Javascript
files (the framework library and the application code). Pretty simple!

You can go to http://tutas-labs.com and follow the tutorial that explains the building of this application (both the 
Meteor server side and the Framework client). 

Clone this into a new folder. Start the Meteor server ($meteor).

Launch the Framework application by using the following URL in your browser: http://localhost:3000/ddp/

Launch the Meteor application by going to http://localhost:3000.

Change or add items from either application and watch the other one update in real time via DDP.

The Framework 'client' code can be found here... https://github.com/tutaslabs/famous-meteor-ddp-client



Enjoy!

You can see a tutorial describing the applications at http://tutas-labs.com

