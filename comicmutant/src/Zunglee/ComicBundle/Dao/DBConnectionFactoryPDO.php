<?php

namespace Zunglee\ComicBundle\Dao;

use Zunglee\ComicBundle\Dao\IDBConnectionFactory;
use ncDatabaseManager;

/**
 * Description of DBConnectionFactoryPDO
 *
 * @author ankitesh
 */
class DBConnectionFactoryPDO implements IDBConnectionFactory {

    static private $m_instance;

    /**
     * 
     * @return DBConnectionFactoryPDO
     */
    static public function getInstance() {
        if (null === self::$m_instance) {
            $class = __CLASS__;
            self::$m_instance = new $class();
        }
        return self::$m_instance;
    }

    public function getDBConnection($dbTag) {
        return ncDatabaseManager::getInstance()->getDatabase($dbTag)->getConnection();
    }

}
