<?php

namespace Zunglee\ComicBundle\Dao;

use Zunglee\ComicBundle\Dao\IBaseDao;
use Zunglee\ComicBundle\Dao\DBConnectionFactoryPDO;
//use Naukri\FFServiceBundle\Services\Log\FFServiceLogger;
//use Naukri\FFServiceBundle\Util\Exception\LoggableDaoException;
//use Naukri\FFServiceBundle\Util\Exception\DaoException;
use JMS\DiExtraBundle\Annotation as DI;
use PDOException;
use PDO;

/**
 * Description of BaseDao
 *
 * @author ankitesh
 * @DI\Service("comic.dao.pdo.base", public=false)
 */
abstract class BaseDaoPdo implements IBaseDao {

    /**
     * @var string Contains the node from database.yml file
     */
    protected $dbTag;

    public function __construct($dbTag) {
        $this->dbTag = $dbTag;
    }

    /**
     *
     * @return \PDO
     */
    public function getConnection($dbTag = null) {
        return DBConnectionFactoryPDO::getInstance()->getDBConnection(is_null($dbTag) ? $this->dbTag : $dbTag);
    }

    public function throwDaoException($msg, $code, $ex) {
        throw new DaoException($msg, $code, $ex);
    }

    protected function throwLoggableDaoException($msg, $code, $ex) {
      //  throw new LoggableDaoException($msg, $code, $ex);
    }

    public function getSqlStringForMultiBind($prefix, $count) {
        $keyArr = array();
        for ($i = 0; $i < $count; $i++) {
            $keyArr[] = ":$prefix$i";
        }
        return implode(',', $keyArr);
    }

    public function bindMultiValue($pdoStmtObj, $prefix, $array, $param = PDO::PARAM_STR) {
        $i = 0;
        foreach ($array as $values) {
            $pdoStmtObj->bindValue(":$prefix$i", $values, $param);
            $i++;
        }
    }

}
