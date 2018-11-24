<?php
class ncPdoDatabaseFactory implements ncDatabaseFactory {
    public function createDatabase($params) {
        $debugFlag = (array_key_exists('debug', $params) && $params['debug'] === true) ? true : false;
        $reconnectFlag = (array_key_exists('reconnect', $params) && $params['reconnect'] === false) ? false : true;

        return new ncPdoDatabase($params['dsn'], $params['username'], $params['password'], $reconnectFlag, $debugFlag);
    }
}

