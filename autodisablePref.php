<?php
/**
 * Sets the VisualEditor autodisable preference on appropriate users.
 *
 * @copyright 2011-2015 VisualEditor Team and others; see AUTHORS.txt
 * @license The MIT License (MIT); see LICENSE.txt
 * @author Alex Monk <amonk@wikimedia.org>
 * @file
 * @ingroup Extensions
 * @ingroup Maintenance
 */

require_once ( getenv( 'MW_INSTALL_PATH' ) !== false
	? getenv( 'MW_INSTALL_PATH' ) . '/maintenance/Maintenance.php'
	: __DIR__ . '/../../../maintenance/Maintenance.php' );

class VEAutodisablePref extends Maintenance {
	public function __construct() {
		parent::__construct();
		$this->mDescription = "Sets the VisualEditor autodisable preference on appropriate users.";
		$this->setBatchSize( 500 );
	}

	public function execute() {
		$dbr = wfGetDB( DB_SLAVE );

		$lastUserId = -1;
		do {
			$results = $dbr->select(
				array( 'user', 'user_properties' ),
				'user_id',
				array(
					'user_id > ' . $dbr->addQuotes( $lastUserId ),
					'up_value IS NULL', // only select users with no entry in user_properties
					'user_editcount > 0'
				),
				__METHOD__,
				array(
					'LIMIT' => $this->mBatchSize,
					'ORDER BY' => 'user_id'
				),
				array(
					'user_properties' => array(
						'LEFT OUTER JOIN',
						'user_id = up_user and up_property = "visualeditor-enable"'
					)
				)
			);
			foreach ( $results as $userRow ) {
				$user = User::newFromId( $userRow->user_id );
				$user->setOption( 'visualeditor-autodisable', true );
				$user->saveSettings();
				$lastUserId = $userRow->user_id;
			}
			$this->output( "Added preference for " . count( $results ) . " users." );
			wfWaitForSlaves();
		} while ( $results->numRows() );
		$this->output( "done.\n" );
	}
}

$maintClass = "VEAutodisablePref";
require_once RUN_MAINTENANCE_IF_MAIN;