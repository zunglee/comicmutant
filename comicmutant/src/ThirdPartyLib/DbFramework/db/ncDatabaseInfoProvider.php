<?php

class ncDatabaseInfoProvider
{
    public function getInfo($params) {
        if (class_exists('InfoMask\InfoMask')) {
            $appKey = $this->getApplicationKey();

            return (new InfoMask\InfoMask())->getInfo($appKey, $params);
        }

        throw new ncDatabaseException('Extension InfoMask not installed.');
    }

    private function getApplicationKey() {
        if (defined('DB_APP_KEY')) {
            $appKey = trim(constant('DB_APP_KEY'));

            if ($appKey) {
                return strtolower($appKey);
            }
        }

        throw new ncDatabaseException('DB_APP_KEY not defined.');
    }
}

