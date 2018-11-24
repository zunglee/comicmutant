<?php

/** class ncYamlFactory
 *
 */
class ncYamlFactory
{
	private static $instance;

	public static function getInstance() {
		if (!isset(self::$instance)) {
			$class = __CLASS__;
			self::$instance = new $class();
		}

		return self::$instance;
	}

	private function __construct() {

	}

	public function getCacher($cacheDir = '') {
		if ($this->checkForXCache()) {
			return new ncXCache();
		}
		elseif ($this->checkForApcCache()) {
			return new ncApcCache();
		}
		else {
			$cacheDir = trim($cacheDir);

			if (!$cacheDir) {
				$cacheDir = defined('YAML_CACHE_DIR') ? constant('YAML_CACHE_DIR') : '/tmp/yaml_cache';
			}

			return new ncFileCache($cacheDir);
		}
	}

	private function checkForXCache() {
		return (function_exists('xcache_set') && ini_get('xcache.var_size') > 0);
	}

	private function checkForApcCache() {
		return function_exists('apc_store') && function_exists('apc_exists');
	}
}

