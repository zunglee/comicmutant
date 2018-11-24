<?php
namespace ncYaml;
class EnvTypeTokenValueGetter{

	public function __construct(){
	}

	public function getTokenValue($token){
		return getenv($token);
	}
}
