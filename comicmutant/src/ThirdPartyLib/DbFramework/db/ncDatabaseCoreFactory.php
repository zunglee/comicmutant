<?php

class ncDatabaseCoreFactory
{
    private $factory;
    private $infoProvider;

    public function __construct($factory, $infoProvider) {
        $this->factory = $factory;
        $this->infoProvider = $infoProvider;
    }

    public function createDatabase($params) {
        $params = $this->formatParams($params);
        return $this->factory->createDatabase($params);
    }

    private function formatParams($params) {
        if (isset($params['version']) && trim($params['version']) == 'v2') {
            $params = $this->infoProvider->getInfo($params);
        }

        return $params;
    }
}

