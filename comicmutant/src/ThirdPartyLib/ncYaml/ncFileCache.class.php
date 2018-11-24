<?php

class ncFileCache implements ncCache
{
	private $cacheDir;

	public function __construct($cacheDir) {
		if(! is_dir($cacheDir)) {
			@mkdir($cacheDir, 0777);
		}

		$this->cacheDir = $cacheDir;
	}

	public function get($key, $default = null) {
		if ($this->has($key)) {
			$filename = $this->getFileName($key);

			include $filename;
			return $$key;
		}

		return $default;
	}

	public function has($key) {
		$filename = $this->getFileName($key);

		return (file_exists($filename) && file_get_contents($filename) != '');
	}

	public function set($key, $data) {
		$filename = $this->getFileName($key);
		$logString = "<?php \$$key = " . var_export($data, true) . "; ";

		@file_put_contents($filename, $logString, LOCK_EX);
	}

	public function remove($key) {
		@unlink($this->getFileName($key));
	}

	private function getFileName($key) {
		return $this->cacheDir . "/$key.cache.php";
	}
}

