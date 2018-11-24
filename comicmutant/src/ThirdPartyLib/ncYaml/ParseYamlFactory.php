<?php

namespace ncYaml;
use ncYaml\ParseYaml;
use ncYaml\TokenValueGetterFactory;

class ParseYamlFactory{

	private static $instance;

	private function __construct(){
	}

        public static function getInstance() {
                if (!self::$instance) {
                        $className = __CLASS__;
                        self::$instance = new $className();
                }
                return self::$instance;
        }

	public function getParseYamlObj(){
		$tokenValueGetterFactoryObj = TokenValueGetterFactory::getInstance();
		return new ParseYaml($tokenValueGetterFactoryObj);
	}
}
