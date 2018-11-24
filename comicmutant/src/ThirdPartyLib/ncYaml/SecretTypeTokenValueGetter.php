<?php

namespace ncYaml;

class SecretTypeTokenValueGetter {

    private $secretDir = '/var/secret/';

    public function __construct() {
        if(!empty(getenv('SECRET_DIR'))){
                $this->secretDir = getenv('SECRET_DIR');
        }

    }

    public function getTokenValue($token) {
        if(!file_exists($this->secretDir . $token)){
                throw new \Exception($this->secretDir . $token. "");
        }
        return file_get_contents($this->secretDir . $token);
    }

}
