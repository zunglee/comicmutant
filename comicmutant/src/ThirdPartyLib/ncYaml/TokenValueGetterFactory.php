<?php

namespace ncYaml;

use ncYaml\SecretTypeTokenValueGetter;
use ncYaml\EnvTypeTokenValueGetter;

class TokenValueGetterFactory {

    private static $instance;
    private $instances = array();

    const SECRET_TYPE_TOKEN = 'secret';
    const ENV_TYPE_TOKEN = 'env';

    private function __construct() {
        
    }

    public static function getInstance() {
        if (!self::$instance) {
            $className = __CLASS__;
            self::$instance = new $className();
        }
        return self::$instance;
    }

    public function getTokenValueGetterType($tokenType) {        
        if (array_key_exists($tokenType, $this->instances)) {
            return $this->instances[$tokenType];
        }

        if ($tokenType == self::SECRET_TYPE_TOKEN) {
            $this->instances[$tokenType] = new SecretTypeTokenValueGetter();
        } else if ($tokenType == self::ENV_TYPE_TOKEN) {
            $this->instances[$tokenType] = new EnvTypeTokenValueGetter();
        }

        return $this->instances[$tokenType];
    }

}
