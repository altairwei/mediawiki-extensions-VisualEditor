/*!
 * VisualEditor MediaWiki Initialization Target class.
 *
 * @copyright 2011-2013 VisualEditor Team and others; see AUTHORS.txt
 * @license The MIT License (MIT); see LICENSE.txt
 */

/*global mw */

/**
 * Initialization MediaWiki target.
 *
 * @class
 * @extends ve.init.Target
 *
 * @constructor
 * @param {jQuery} $container Conainter to render target into
 * @param {string} pageName Name of target page
 * @param {number} [revision] Revision ID
 */
ve.init.mw.Target = function VeInitMwTarget( $container, pageName, revision ) {
	// Parent constructor
	ve.init.Target.call( this, $container );

	// Properties
	this.pageName = pageName;
	this.pageExists = mw.config.get( 'wgArticleId', 0 ) !== 0;
	this.oldid = revision || mw.config.get( 'wgCurRevisionId' );
	this.editToken = mw.user.tokens.get( 'editToken' );
	this.apiUrl = mw.util.wikiScript( 'api' );
	this.submitUrl = ( new mw.Uri( mw.util.wikiGetlink( this.pageName ) ) )
		.extend( { 'action': 'submit' } );
	this.modules = [
			mw.config.get( 'wgVisualEditorConfig' ).enableExperimentalCode ?
				'ext.visualEditor.experimental' : 'ext.visualEditor.core',
			'ext.visualEditor.specialMessages'
		]
		.concat(
			document.createElementNS && document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' ).createSVGRect ?
				['ext.visualEditor.viewPageTarget.icons-vector', 'ext.visualEditor.icons-vector'] :
				['ext.visualEditor.viewPageTarget.icons-raster', 'ext.visualEditor.icons-raster']
		);
	this.loading = false;
	this.saving = false;
	this.serializing = false;
	this.submitting = false;
	this.baseTimeStamp = null;
	this.startTimeStamp = null;
	this.doc = null;
	this.editNotices = null;
	this.isMobileDevice = (
		'ontouchstart' in window ||
			( window.DocumentTouch && document instanceof window.DocumentTouch )
	);
};

/**
 * @event load
 * @param {HTMLDocument} dom
 */

/**
 * @event editConflict
 */

/**
 * @event save
 * @param {string} html
 */

/**
 * @event showChanges
 * @param {string} diff
 */

/**
 * @event noChanges
 */

/**
 * @event loadError
 * @param {jqXHR|null} jqXHR
 * @param {string} status Text status message
 * @param {Mixed|null} error HTTP status text
 */

/**
 * @event tokenError
 * @param {jqXHR|null} jqXHR
 * @param {string} status Text status message
 * @param {Mixed|null} error HTTP status text
 */

/**
 * @event saveError
 * @param {jqXHR|null} jqXHR
 * @param {string} status Text status message
 * @param {Mixed|null} error HTTP status text
 */

/**
 * @event showChangesError
 * @param {jqXHR|null} jqXHR
 * @param {string} status Text status message
 * @param {Mixed|null} error HTTP status text
 */

/**
 * @event serializeError
 * @param {jqXHR|null} jqXHR
 * @param {string} status Text status message
 * @param {Mixed|null} error HTTP status text
 */

/* Inheritance */

ve.inheritClass( ve.init.mw.Target, ve.init.Target );

/* Static Methods */

/**
 * Handle response to a successful load request.
 *
 * This method is called within the context of a target instance. If successful the DOM from the
 * server will be parsed, stored in {this.doc} and then {ve.init.mw.Target.onReady} will be called once
 * the modules are ready.
 *
 * @static
 * @method
 * @param {Object} response XHR Response object
 * @param {string} status Text status message
 * @emits loadError
 */
ve.init.mw.Target.onLoad = function ( response ) {
	var key, tmp, el,
		data = response ? response.visualeditor : null;

	if ( !data && !response.error ) {
		ve.init.mw.Target.onLoadError.call(
			this, null, 'Invalid response in response from server', null
		);
	} else if ( response.error || data.result === 'error' ) {
		if ( response.error.code === 'badtoken' && !this.retriedToken ) {
			// Only retry once
			this.retriedToken = true;
			// Refresh the edit token and try again
			this.retryToken();
		} else {
			ve.init.mw.Target.onLoadError.call( this, null,
				response.error.code + ': ' + response.error.info,
				null
			);
		}
	} else if ( typeof data.content !== 'string' ) {
		ve.init.mw.Target.onLoadError.call(
			this, null, 'No HTML content in response from server', null
		);
	} else {
		this.originalHtml = data.content;
		this.doc = ve.createDocumentFromHtml( this.originalHtml );

		/* Don't show notices with no visible html (bug 43013). */

		// Since we're going to parse them, we might as well save these nodes
		// so we don't have to parse them again later.
		this.editNotices = {};

		// This is a temporary container for parsed notices in the <body>.
		// We need the elements to be in the DOM in order for stylesheets to apply
		// and jquery.visibleText to determine whether a node is visible.
		tmp = document.createElement( 'div' );

		// The following is essentially display none, but we can't use that
		// since then all descendants will be considered invisible too.
		tmp.style.cssText = 'position: static; top: 0; width: 0; height: 0; border: 0; visibility: hidden';

		document.body.appendChild( tmp );
		for ( key in data.notices ) {
			el = $( '<div>' )
				.addClass( 've-init-mw-viewPageTarget-toolbar-editNotices-notice' )
				.attr( 'rel', key )
				.html( data.notices[key] )
				.get( 0 );

			tmp.appendChild( el );
			if ( $.getVisibleText( el ).trim() !== '' ) {
				this.editNotices[key] = el;
			}
			tmp.removeChild( el );
		}
		document.body.removeChild( tmp );

		this.baseTimeStamp = data.basetimestamp;
		this.startTimeStamp = data.starttimestamp;
		// Everything worked, the page was loaded, continue as soon as the module is ready
		mw.loader.using( this.modules, ve.bind( ve.init.mw.Target.onReady, this ) );
	}
};

/**
 * Handle response to a successful edit token refresh request.
 *
 * This method is called within the context of a target instance. If successful the token will
 * be stored and load() will be called.
 *
 * @static
 * @method
 * @param {Object} response XHR Response object
 * @param {string} status Text status message
 * @emits tokenError
 */
ve.init.mw.Target.onToken = function ( response ) {
	var token = response && response.tokens && response.tokens.edittoken;
	if ( token ) {
		this.editToken = token;
		mw.user.tokens.set( 'editToken', token );
		this.loading = false; // Otherwise this.load() doesn't do anything
		this.load();
	} else if ( !response.error ) {
		ve.init.mw.Target.onTokenError.call(
			this, null, 'Invalid response in response from server', null
		);
	} else {
		ve.init.mw.Target.onTokenError.call( this, null,
			response.error.code + ': ' + response.error.info,
			null
		);
	}
};

/**
 * Handle both DOM and modules being loaded and ready.
 *
 * This method is called within the context of a target instance.
 *
 * @static
 * @method
 * @emits load
 */
ve.init.mw.Target.onReady = function () {
	this.loading = false;
	this.emit( 'load', this.doc );
};

/**
 * Handle an unsuccessful load request.
 *
 * This method is called within the context of a target instance.
 *
 * @static
 * @method
 * @param {Object} jqXHR
 * @param {string} status Text status message
 * @param {Mixed} error HTTP status text
 * @emits loadError
 */
ve.init.mw.Target.onLoadError = function ( jqXHR, status, error ) {
	this.loading = false;
	this.emit( 'loadError', jqXHR, status, error );
};

/**
 * Handle an unsuccessful token refresh request.
 *
 * This method is called within the context of a target instance.
 *
 * @param {Object} jqXHR
 * @param {string} status Text status message
 * @param {Mixed} error HTTP status text
 * @emits tokenError
 */
ve.init.mw.Target.onTokenError = function ( jqXHR, status, error ) {
	this.loading = false;
	this.emit( 'tokenError', jqXHR, status, error );
};

/**
 * Handle a successful save request.
 *
 * This method is called within the context of a target instance.
 *
 * @static
 * @method
 * @param {Object} response Response data
 * @param {string} status Text status message
 * @emits editConflict
 * @emits save
 */
ve.init.mw.Target.onSave = function ( response ) {
	this.saving = false;
	var data = response.visualeditor;
	if ( !data && !response.error ) {
		ve.init.mw.Target.onSaveError.call( this, null, 'Invalid response from server', null );
	} else if ( response.error ) {
		if (response.error.code === 'editconflict' ) {
			this.emit( 'editConflict' );
		} else {
			ve.init.mw.Target.onSaveError.call(
				this, null, 'Unsuccessful request: ' + response.error.info, null
			);
		}
	} else if ( data.result !== 'success' ) {
		ve.init.mw.Target.onSaveError.call( this, null, 'Failed request: ' + data.result, null );
	} else if ( typeof data.content !== 'string' ) {
		ve.init.mw.Target.onSaveError.call(
			this, null, 'Invalid HTML content in response from server', null
		);
	} else {
		this.emit( 'save', data.content, data.newrevid );
	}
};

/**
 * Handle an unsuccessful save request.
 *
 * @static
 * @method
 * @this ve.init.mw.Target
 * @param {Object} jqXHR
 * @param {string} status Text status message
 * @param {Mixed} error HTTP status text
 * @emits saveError
 */
ve.init.mw.Target.onSaveError = function ( jqXHR, status, error ) {
	this.saving = false;
	this.emit( 'saveError', jqXHR, status, error );
};


/**
 * Handle a successful show changes request.
 *
 * @static
 * @method
 * @param {Object} response API response data
 * @param {string} status Text status message
 * @emits showChanges
 * @emits noChanges
 */
ve.init.mw.Target.onShowChanges = function ( response ) {
	var data = response.visualeditor;
	if ( !data && !response.error ) {
		ve.init.mw.Target.onShowChangesError.call( this, null, 'Invalid response from server', null );
	} else if ( response.error ) {
		ve.init.mw.Target.onShowChangesError.call(
			this, null, 'Unsuccessful request: ' + response.error.info, null
		);
	} else if ( data.result === 'nochanges' ) {
		this.emit( 'noChanges' );
	} else if ( data.result !== 'success' ) {
		ve.init.mw.Target.onShowChangesError.call( this, null, 'Failed request: ' + data.result, null );
	} else if ( typeof data.diff !== 'string' ) {
		ve.init.mw.Target.onShowChangesError.call(
			this, null, 'Invalid HTML content in response from server', null
		);
	} else {
		this.emit( 'showChanges', data.diff );
	}
};

/**
 * Handle errors during saveChanges action.
 *
 * @static
 * @method
 * @this ve.init.mw.Target
 * @param {Object} jqXHR
 * @param {string} status Text status message
 * @param {Mixed} error HTTP status text
 * @emits showChangesError
 */
ve.init.mw.Target.onShowChangesError = function ( jqXHR, status, error ) {
	this.saving = false;
	this.emit( 'showChangesError', jqXHR, status, error );
};

/**
 * Handle a successful serialize request.
 *
 * This method is called within the context of a target instance.
 *
 * @static
 * @method
 * @param {Object} data API response data
 * @param {string} status Text status message
 */
ve.init.mw.Target.onSerialize = function ( response ) {
	this.serializing = false;
	var data = response.visualeditor;
	if ( !data && !response.error ) {
		ve.init.mw.Target.onSerializeError.call( this, null, 'Invalid response from server', null );
	} else if ( response.error ) {
		ve.init.mw.Target.onSerializeError.call(
			this, null, 'Unsuccessful request: ' + response.error.info, null
		);
	} else if ( data.result === 'error' ) {
		ve.init.mw.Target.onSerializeError.call( this, null, 'Server error', null );
	} else if ( typeof data.content !== 'string' ) {
		ve.init.mw.Target.onSerializeError.call(
			this, null, 'No Wikitext content in response from server', null
		);
	} else {
		if ( typeof this.serializeCallback === 'function' ) {
			this.serializeCallback( data.content );
			delete this.serializeCallback;
		}
	}
};

/**
 * Handle an unsuccessful serialize request.
 *
 * This method is called within the context of a target instance.
 *
 * @static
 * @method
 * @param {jqXHR|null} jqXHR
 * @param {string} status Text status message
 * @param {Mixed|null} error HTTP status text
 * @emits serializeError
 */
ve.init.mw.Target.onSerializeError = function ( jqXHR, status, error ) {
	this.serializing = false;
	this.emit( 'serializeError', jqXHR, status, error );
};

/* Methods */

/**
 * Get HTML to send to Parsoid. This takes a document generated by the converter and
 * transplants the head tag from the old document into it, as well as the attributes on the
 * html and body tags.
 *
 * @param {HTMLDocument} newDoc Document generated by ve.dm.Converter. Will be modified.
 * @returns {string} Full HTML document
 */
ve.init.mw.Target.prototype.getHtml = function ( newDoc ) {
	var i, len, oldDoc = this.doc;

	function copyAttributes( from, to ) {
		var i, len;
		for ( i = 0, len = from.attributes.length; i < len; i++ ) {
			to.setAttribute( from.attributes[i].name, from.attributes[i].value );
		}
	}

	// Copy the head from the old document
	for ( i = 0, len = oldDoc.head.childNodes.length; i < len; i++ ) {
		newDoc.head.appendChild( oldDoc.head.childNodes[i].cloneNode( true ) );
	}
	// Copy attributes from the old document for the html, head and body
	copyAttributes( oldDoc.documentElement, newDoc.documentElement );
	copyAttributes( oldDoc.head, newDoc.head );
	copyAttributes( oldDoc.body, newDoc.body );
	return '<!doctype html>' + ve.properOuterHtml( newDoc.documentElement );
};

/**
 * Get DOM data from the Parsoid API.
 *
 * This method performs an asynchronous action and uses a callback function to handle the result.
 *
 * A side-effect of calling this method is that it requests {this.modules} be loaded.
 *
 * @method
 * @returns {boolean} Loading has been started
*/
ve.init.mw.Target.prototype.load = function () {
	// Prevent duplicate requests
	if ( this.loading ) {
		return false;
	}
	// Start loading the module immediately
	mw.loader.load( this.modules );
	// Load DOM
	this.loading = $.ajax( {
		'url': this.apiUrl,
		'data': {
			'action': 'visualeditor',
			'paction': 'parse',
			'page': this.pageName,
			'oldid': this.oldid,
			'token': this.editToken,
			'format': 'json'
		},
		'dataType': 'json',
		'type': 'POST',
		// Wait up to 100 seconds before giving up
		'timeout': 100000,
		'cache': 'false',
		'success': ve.bind( ve.init.mw.Target.onLoad, this ),
		'error': ve.bind( ve.init.mw.Target.onLoadError, this )
	} );
	return true;
};

/**
 * Refresh the edit token, then call load()
 */
ve.init.mw.Target.prototype.retryToken = function () {
	$.ajax( {
		'url': this.apiUrl,
		'data': {
			'action': 'tokens',
			'format': 'json'
		},
		'dataType': 'json',
		'type': 'GET',
		'cache': 'false',
		'success': ve.bind( ve.init.mw.Target.onToken, this ),
		'error': ve.bind( ve.init.mw.Target.onTokenError, this )
	} );
};

/**
 * Post DOM data to the Parsoid API.
 *
 * This method performs an asynchronous action and uses a callback function to handle the result.
 *
 *     target.save( dom, { 'summary': 'test', 'minor': true, 'watch': false } );
 *
 * @method
 * @param {HTMLDocument} doc Document to save
 * @param {Object} options Saving options
 *  - {string} summary Edit summary
 *  - {boolean} minor Edit is a minor edit
 *  - {boolean} watch Watch the page
 * @returns {boolean} Saving has been started
*/
ve.init.mw.Target.prototype.save = function ( doc, options ) {
	// Prevent duplicate requests
	if ( this.saving ) {
		return false;
	}
	// Save DOM
	this.saving = true;
	$.ajax( {
		'url': this.apiUrl,
		'data': {
			'format': 'json',
			'action': 'visualeditor',
			'paction': 'save',
			'page': this.pageName,
			'oldid': this.oldid,
			'basetimestamp': this.baseTimeStamp,
			'starttimestamp': this.startTimeStamp,
			'html': this.getHtml( doc ),
			'token': this.editToken,
			'summary': options.summary,
			'minor': Number( options.minor ),
			'watch': Number( options.watch )
		},
		'dataType': 'json',
		'type': 'POST',
		// Wait up to 100 seconds before giving up
		'timeout': 100000,
		'success': ve.bind( ve.init.mw.Target.onSave, this ),
		'error': ve.bind( ve.init.mw.Target.onSaveError, this )
	} );
	return true;
};

/**
 * Post DOM data to the Parsoid API to retreive wikitext diff.
 *
 * @method
 * @param {HTMLDocument} doc Document to compare against (via wikitext)
*/
ve.init.mw.Target.prototype.showChanges = function ( doc ) {
	$.ajax( {
		'url': this.apiUrl,
		'data': {
			'format': 'json',
			'action': 'visualeditor',
			'paction': 'diff',
			'page': this.pageName,
			'oldid': this.oldid,
			'html': this.getHtml( doc ),
			// TODO: API required editToken, though not relevant for diff
			'token': this.editToken
		},
		'dataType': 'json',
		'type': 'POST',
		// Wait up to 100 seconds before giving up
		'timeout': 100000,
		'success': ve.bind( ve.init.mw.Target.onShowChanges, this ),
		'error': ve.bind( ve.init.mw.Target.onShowChangesError, this )
	} );
};

/**
 * Post DOM data to the Parsoid API.
 *
 * This method performs a synchronous action and will take the user to a new page when complete.
 *
 *     target.submit( wikitext, { 'summary': 'test', 'minor': true, 'watch': false } );
 *
 * @method
 * @param {string} wikitext Wikitext to submit
 * @param {Object} options Saving options
 *  - {string} summary Edit summary
 *  - {boolean} minor Edit is a minor edit
 *  - {boolean} watch Watch the page
 * @returns {boolean} Submitting has been started
*/
ve.init.mw.Target.prototype.submit = function ( wikitext, options ) {
	// Prevent duplicate requests
	if ( this.submitting ) {
		return false;
	}
	// Save DOM
	this.submitting = true;
	var key,
		$form = $( '<form method="post" enctype="multipart/form-data"></form>' ),
		params = {
			'format': 'text/x-wiki',
			'oldid': this.oldid,
			'wpStarttime': this.baseTimeStamp,
			'wpEdittime': this.startTimeStamp,
			'wpTextbox1': wikitext,
			'wpSummary': options.summary,
			'wpWatchthis': Number( options.watch ),
			'wpMinoredit': Number( options.minor ),
			'wpEditToken': this.editToken,
			'wpSave': 1
		};
	// Add params as hidden fields
	for ( key in params ) {
		$form.append( $( '<input type="hidden">' ).attr( { 'name': key, 'value': params[key] } ) );
	}
	// Submit the form, mimicking a traditional edit
	$form.attr( 'action', this.submitUrl ).appendTo( 'body' ).submit();
	return true;
};

/**
 * Get Wikitext data from the Parsoid API.
 *
 * This method performs an asynchronous action and uses a callback function to handle the result.
 *
 *     target.serialize(
 *         dom,
 *         function ( wikitext ) {
 *             // Do something with the loaded DOM
 *         }
 *     );
 *
 * @method
 * @param {HTMLDocument} doc Document to serialize
 * @param {Function} callback Function to call when complete, accepts error and wikitext arguments
 * @returns {boolean} Serializing has beeen started
*/
ve.init.mw.Target.prototype.serialize = function ( doc, callback ) {
	// Prevent duplicate requests
	if ( this.serializing ) {
		return false;
	}
	// Load DOM
	this.serializing = true;
	this.serializeCallback = callback;
	$.ajax( {
		'url': this.apiUrl,
		'data': {
			'action': 'visualeditor',
			'paction': 'serialize',
			'html': this.getHtml( doc ),
			'page': this.pageName,
			'oldid': this.oldid,
			'token': this.editToken,
			'format': 'json'
		},
		'dataType': 'json',
		'type': 'POST',
		// Wait up to 100 seconds before giving up
		'timeout': 100000,
		'cache': 'false',
		'success': ve.bind( ve.init.mw.Target.onSerialize, this ),
		'error': ve.bind( ve.init.mw.Target.onSerializeError, this )
	} );
	return true;
};

/**
 * Send a problem report to the Parsoid API.
 *
 * @method
 * @param {string} message
 */
ve.init.mw.Target.prototype.reportProblem = function ( message ) {
	// Gather reporting information
	var now = new Date(),
		doc = this.surface.getModel().getDocument(),
		editedData = doc.getFullData(),
		store = doc.getStore(),
		internalList = doc.getInternalList(),
		report = {
			'title': this.pageName,
			'oldid': this.oldid,
			'timestamp': now.getTime() + 60000 * now.getTimezoneOffset(),
			'message': message,
			'diff': this.diffHtml,
			'originalHtml': this.originalHtml,
			'originalData':
				// originalHtml only has the body's HTML for now, see TODO comment in
				// ve.init.mw.ViewPageTarget.prototype.setupSurface
				// FIXME: need to expand this data before sending it, see bug 47319
				ve.dm.converter.getDataFromDom(
					ve.createDocumentFromHtml( '<body>' + this.originalHtml  + '</body>' ),
					store, internalList
				).getData(),
			'editedData': editedData,
			'editedHtml': this.getHtml(
				ve.dm.converter.getDomFromData( editedData, store, internalList )
			),
			'store': doc.data.getUsedStoreValues(),
			'wiki': mw.config.get( 'wgDBname' )
		};
	$.post(
		mw.config.get( 'wgVisualEditorConfig' ).reportProblemURL,
		{ 'data': JSON.stringify( ve.copyObject( report, ve.convertDomElements ) ) },
		function () {
			// This space intentionally left blank
		},
		'text'
	);
};
