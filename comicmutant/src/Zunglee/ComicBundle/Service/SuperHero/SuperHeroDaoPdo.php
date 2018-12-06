<?php

namespace Zunglee\ComicBundle\Service\SuperHero;

use Zunglee\ComicBundle\Dao\BaseDaoPdo;
use Zunglee\ComicBundle\Util\Common;
use JMS\DiExtraBundle\Annotation as DI;
use PDO;
use Exception;
use Zunglee\ComicBundle\Util\ConverterUtil;
use Zunglee\ComicBundle\Model\ComicMutant\ComicSuperHeroModel;

/**
 * Description of SuperHeroDaoPdo
 *
 * @author ankitesh
 * @DI\Service("comic.superhero.dao.pdo", parent="comic.dao.pdo.base")
 */
class SuperHeroDaoPdo extends BaseDaoPdo {

    private $comicSuperHeroModel;
    
    /**
     * @DI\InjectParams({ 
     *   "dbTag"=@DI\Inject("%comic.db.tag.master_1%")} 
     * )
     */
    public function __construct($dbTag) {
        parent::__construct($dbTag);
        $this->comicSuperHeroModel = new comicSuperHeroModel();
    }

    public function getSuperHeroDetail($comicName) {
        try {
            $comicDetailModel = null;
            $dbConn = $this->getConnection();
            $sql = "SELECT comic_id,superhero_id,comic_name,summary FROM  COMIC_SUPERHERO WHERE comic_name=:comic_name";
            $pdoStmt = $dbConn->prepare($sql);
            $pdoStmt->bindValue(':comic_name', $comicName, PDO::PARAM_STR);
            $pdoStmt->execute();
            $comicSuperHeroModel = ConverterUtil::convertArraytoObject($pdoStmt->fetch(PDO::FETCH_ASSOC), $this->comicSuperHeroModel);                
            return $comicSuperHeroModel;
            } catch (Exception $e) {
            print_r($e);
            die;
//$this->throwLoggableDaoException($e->getMessage(), $e->getCode(), $e);
        }
    }

}
