<?php
namespace Zunglee\ComicBundle\Service\SuperHero;

use JMS\DiExtraBundle\Annotation as DI;
use Exception;

/**
 * Description of SuperHeroDao
 *
 * @author ankitesh
 * @DI\Service("comic.superhero.dao")
 */
class SuperHeroDao {
    
    
    private $superHeroDaoPdo;

    /**
     * @DI\InjectParams({
     *  "superHeroDaoPdo" = @DI\Inject("comic.superhero.dao.pdo"),
     * })
     */
    public function __construct($superHeroDaoPdo) {
        $this->superHeroDaoPdo = $superHeroDaoPdo;
    }

    public function getSuperHeroDetail($comicName) {
        $detail = $this->superHeroDaoPdo->getSuperHeroDetail($comicName);
        return $detail;
    }

    
}
