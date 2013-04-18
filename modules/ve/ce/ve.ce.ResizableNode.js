/*!
 * VisualEditor ContentEditable ResizableNode class.
 *
 * @copyright 2011-2013 VisualEditor Team and others; see AUTHORS.txt
 * @license The MIT License (MIT); see LICENSE.txt
 */

/**
 * ContentEditable resizable node.
 *
 * @class
 * @abstract
 *
 * @constructor
 * @param {jQuery} [$resizable=this.$] Resizable DOM element
 */
ve.ce.ResizableNode = function VeCeResizableNode( $resizable ) {
	// Properties
	this.$resizable = $resizable || this.$;
	this.ratio = this.model.getAttribute( 'width' ) / this.model.getAttribute( 'height' );
	this.resizing = false;
	this.$resizeHandles = $( '<div>' );

	// Events
	this.addListenerMethods( this, {
		'focus': 'onResizableFocus',
		'blur': 'onResizableBlur'
	} );

	// Initialization
	this.$resizeHandles
		.addClass( 've-ce-resizableNode-handles' )
		.append( $( '<div>' ).addClass( 've-ce-resizableNode-nwHandle' ) )
		.append( $( '<div>' ).addClass( 've-ce-resizableNode-neHandle' ) )
		.append( $( '<div>' ).addClass( 've-ce-resizableNode-seHandle' ) )
		.append( $( '<div>' ).addClass( 've-ce-resizableNode-swHandle' ) )
		.children()
			.on( {
				'mousedown': ve.bind( this.onResizeHandlesCornerMouseDown, this )
			} );
};

/* Methods */

/**
 * Handle node focus.
 *
 * @method
 */
ve.ce.ResizableNode.prototype.onResizableFocus = function () {
	var offset = this.$image.offset();

	this.$resizeHandles
		.css( {
			'width': 0,
			'height': 0,
			'top': offset.top,
			'left': offset.left
		} )
		.appendTo( $( 'body' ) );

	this.$resizeHandles
		.find('.ve-ce-resizableNode-neHandle').css( {
			'margin-right': -this.$image.width()
		} ).end()
		.find('.ve-ce-resizableNode-swHandle').css( {
			'margin-bottom': -this.$image.height()
		} ).end()
		.find('.ve-ce-resizableNode-seHandle').css( {
			'margin-right': -this.$image.width(),
			'margin-bottom': -this.$image.height()
		} );
};

/**
 * Handle node blur.
 *
 * @method
 */
ve.ce.ResizableNode.prototype.onResizableBlur = function () {
	this.$resizeHandles.detach();
};

/**
 * Handle bounding box handle mousedown.
 *
 * @method
 * @param {jQuery.Event} e Click event
 */
ve.ce.ResizableNode.prototype.onResizeHandlesCornerMouseDown = function ( e ) {

	// Set bounding box width and undo the handle margins
	this.$resizeHandles
		.css( {
			'width': this.$image.width(),
			'height': this.$image.height()
		} );

	this.$resizeHandles.children().css( 'margin', 0 );

	// Values to calculate adjusted bounding box size
	this.resizeInfo = {
		'mouseX': e.screenX,
		'mouseY': e.screenY,
		'top': this.$resizeHandles.position().top,
		'left': this.$resizeHandles.position().left,
		'height': this.$resizeHandles.height(),
		'width': this.$resizeHandles.width(),
		'handle': e.target.className,
	};

	// Bind resize events
	this.resizing = true;
	$( document ).on( {
		'mousemove.ve-ce-resizableNode': ve.bind( this.onDocumentMouseMove, this ),
		'mouseup.ve-ce-resizableNode': ve.bind( this.onDocumentMouseUp, this )
	} );

	return false;
};

/**
 * Handle body mousemove.
 *
 * @method
 * @param {jQuery.Event} e Click event
 */
ve.ce.ResizableNode.prototype.onDocumentMouseMove = function ( e ) {
	var newWidth, newHeight, newRatio,
		// TODO: Make these configurable
		min = 1,
		max = 1000,
		diff = {},
		dimensions = {
			'width': 0,
			'height': 0,
			'top': this.resizeInfo.top,
			'left': this.resizeInfo.left
		};

	if ( this.resizing ) {
		// X and Y diff
		switch ( this.resizeInfo.handle ) {
			case 've-ce-resizableNode-seHandle':
				diff.x = e.screenX - this.resizeInfo.mouseX;
				diff.y = e.screenY - this.resizeInfo.mouseY;
				break;
			case 've-ce-resizableNode-nwHandle':
				diff.x = this.resizeInfo.mouseX - e.screenX;
				diff.y = this.resizeInfo.mouseY - e.screenY;
				break;
			case 've-ce-resizableNode-neHandle':
				diff.x = e.screenX - this.resizeInfo.mouseX;
				diff.y = this.resizeInfo.mouseY - e.screenY;
				break;
			case 've-ce-resizableNode-swHandle':
				diff.x = this.resizeInfo.mouseX - e.screenX;
				diff.y = e.screenY - this.resizeInfo.mouseY;
				break;
		}

		// Unconstrained dimensions and ratio
		newWidth = Math.max( Math.min( this.$image.width() + diff.x, max ), min );
		newHeight = Math.max( Math.min( this.$image.height() + diff.y, max ), min );
		newRatio = newWidth / newHeight;

		// Fix the ratio
		if ( this.ratio > newRatio ) {
			dimensions.width = newWidth;
			dimensions.height = this.$image.height() +
				( newWidth - this.$image.width() ) / this.ratio;
		} else {
			dimensions.width = this.$image.width() +
				( newHeight - this.$image.height() ) * this.ratio;
			dimensions.height = newHeight;
		}

		// Fix the position
		switch ( this.resizeInfo.handle ) {
			case 've-ce-resizableNode-neHandle':
				dimensions.top = this.resizeInfo.top +
					( this.resizeInfo.height - dimensions.height );
				break;
			case 've-ce-resizableNode-swHandle':
				dimensions.left = this.resizeInfo.left +
					( this.resizeInfo.width - dimensions.width );
				break;
			case 've-ce-resizableNode-nwHandle':
				dimensions.top = this.resizeInfo.top +
					( this.resizeInfo.height - dimensions.height );
				dimensions.left = this.resizeInfo.left +
					( this.resizeInfo.width - dimensions.width );
				break;
		}

		// Update bounding box
		this.$resizeHandles.css( dimensions );
	}
};

/**
 * Handle body mouseup.
 *
 * @method
 */
ve.ce.ResizableNode.prototype.onDocumentMouseUp = function () {
	var offset = this.model.getOffset(),
		width = this.$resizeHandles.outerWidth(),
		height = this.$resizeHandles.outerHeight(),
		surfaceModel = this.getRoot().getSurface().getModel(),
		documentModel = surfaceModel.getDocument(),
		selection = surfaceModel.getSelection(),
		txs = [];

	$( document ).off( '.ve-ce-resizableNode' );
	this.resizing = false;

	txs.push( ve.dm.Transaction.newFromAttributeChange( documentModel, offset, 'width', width ) );
	txs.push( ve.dm.Transaction.newFromAttributeChange( documentModel, offset, 'height', height ) );
	surfaceModel.change( txs, selection );

	// HACK: Update bounding box
	this.onResizableFocus();
};
