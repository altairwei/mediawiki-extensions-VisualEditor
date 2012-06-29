/**
 * This contains all the callbacks used for handling the server's Socket.IO events
 * Binds all the callback methods to a `callbacks` object which can be used as a module import
**/

var Session = require( './collab.Session.js' ).Session,
	Document = require( './collab.Document.js' ).Document,
	parse = require( './collab.parse.js' ).parse,
	crypto = require( 'crypto' );

Callbacks = function( server, socket ) {
	this.server = server;
	this.socket = socket;
};

Callbacks.prototype.broadcast = function( event, args ) {
	var routeCallbacks = this.sessionRoute.callbacks;
	for( cb in routeCallbacks ) {
		var socket = routeCallbacks[ cb ].socket;
		socket.emit( event, args );
	}
};

Callbacks.prototype.authenticate = function( authData ) {
	var ssID = Session.generateID( [ authData.userName, 
			authData.docTitle, this.server.docRoutes.length ] );
	this.socket.emit( 'client_auth', { sessionID: ssID } );
};

/**
 * Callback method to be invoked when a new client initiates its session
**/
Callbacks.prototype.clientConnection = function( data ) {
	console.log('new connection');
	console.log(data);
	var userID = data.user,
		docTitle = data.title,
		docRoutes = this.server.docRoutes,
		remoteSSID = data.ssid,
		sessionRoute = null,
		_this = this,
		docHTML = '',
		sessionDoc = null,
		argAllowPublish = false;

	var postDocInit = function() {
		_this.sessionRoute = sessionRoute;
		_this.session = new Session( sessionDoc, userID );
		var routeCallbacks = sessionRoute.callbacks;
		// Bind some session events here
		_this.session.on( 'allowPublish', function( e ) {
			sessionRoute.document.hasPublisher = false;
			if( !e ) {
				for( cb in routeCallbacks ) {
					var callback = routeCallbacks[ cb ];
					if( callback.session.isPublisher == true ) {
						sessionRoute.document.hasPublisher = true;
						break;
					}
				}
			}
		} );
		_this.session.allowPublish( argAllowPublish );
		_this.socket.emit( 'document_transfer', { 
			html: docHTML,
			users: function() {
				var users = [];
				for( cb in routeCallbacks ) {
					if( routeCallbacks[ cb ] != _this ) {
						users.push( routeCallbacks[ cb ].session.userName );
					}
				}
				return users;
			}(),
			allowPublish: argAllowPublish 
		} );

		_this.broadcast( 'client_connect', userID );
	};

	var sessionRoute = this.server.lookupRoutes( docTitle );
	if( sessionRoute ) {
		var sessionDoc = sessionRoute.document;
		sessionRoute.callbacks.push( this );
		var argAllowPublish = false;
		docHTML = sessionDoc.getHTML();
		console.log(docHTML);
		postDocInit();
	}

	if( sessionRoute == null ) {
		// Parse the page by its title using the external parsoid service
		parse( true, docTitle, function( html ) {
			/** 
			 * Proceed with creating a new route with a new document,
			 * if no existing document route was found.
			**/
			docHTML = html
			sessionDoc = new Document( docTitle, html );
			sessionRoute = {
				document: sessionDoc,
				callbacks: [ _this ]
			};
			argAllowPublish = true;
			docRoutes.push( sessionRoute );
			postDocInit();
		} );
	}
};

/**
 * Callback method to be invoked when a client closes its session
**/
Callbacks.prototype.clientDisconnection = function( data ) {
	if( this.session ) {
		// revoke publisher if the session could publish
		if( this.session.isPublisher ) {
			this.session.Document.hasPublisher = false;
		}

		var sessionIndex = this.sessionRoute.callbacks.indexOf( this );
		this.sessionRoute.callbacks.splice( sessionIndex, 1 );
		this.broadcast( 'client_disconnect', this.session.userName );

	}

};

/**
 * Callback method to be invoked when a new transaction arrives at the server
**/
Callbacks.prototype.newTransaction = function( transactionData ) {
	var doc = this.session.Document;
	var transaction = transactionData;
	doc.applyTransaction( this.session, transactionData );
	this.broadcast( 'new_transaction', transactionData );
};

/**
 * Callback method to be invoked when a save document command is received from the client
 * This passes control to the parser's page Save pipeline
**/
Callbacks.prototype.saveDocument = function( transaction ) {

};

if ( typeof module == 'object' ) {
	module.exports.Callbacks = Callbacks;
}
