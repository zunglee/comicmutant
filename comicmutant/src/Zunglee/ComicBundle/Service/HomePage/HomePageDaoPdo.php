<?php

namespace Zunglee\ComicBundle\Service\HomePage;

use Zunglee\ComicBundle\Dao\BaseDaoPdo;
use JMS\DiExtraBundle\Annotation as DI;
use Exception;

/**
 * @author ankitesh
 * 
 * @DI\Service("comic.homepage.dao.pdo", parent="comic.dao.pdo.base")
 */
class HomePageDaoPdo extends BaseDaoPdo {


    /**
     * @DI\InjectParams({ 
     *   "dbTag"=@DI\Inject("%comic.db.tag.master_1%")} 
     * )
     */
    public function __construct($dbTag) {
        parent::__construct($dbTag);
    }

    public function getHomePageContent() {
        try {
            $dbConn = $this->getConnection();
            $searchQuery = "SELECT * FROM  SUPERHERO";
            $pdoStmt = $dbConn->prepare($searchQuery);
            $pdoStmt->execute();
            $row = $pdoStmt->fetchAll();
            var_Dump($row);die;
            $pdoStmt->closeCursor();
            return $eCourseDetails;
        } catch (Exception $e) {
         print_r($e);die;   
//$this->throwLoggableDaoException($e->getMessage(), $e->getCode(), $e);
        }
    }

}
