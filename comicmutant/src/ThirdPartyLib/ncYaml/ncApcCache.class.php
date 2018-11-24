<?php

class ncApcCache implements ncCache
{
	public function get($key, $default = null) {
		return ($this->has($key)) ? json_decode(apc_fetch($key), true) : $default;
	}

	public function has($key) {
		return apc_exists($key);
	}

	public function set($key, $data) {
		apc_store($key, json_encode($data));
	}

	public function remove($key) {
		apc_delete($key);
	}
}

