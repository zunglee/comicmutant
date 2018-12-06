<?php

namespace Zunglee\ComicBundle\Service\SuperHero;

use JMS\DiExtraBundle\Annotation as DI;
use Exception;

/**
 * Description of SuperHeroService
 *
 * @author ankitesh
 * @DI\Service("comic.superhero.service")
 */
class SuperHeroService {

    private $superHeroDao;

    /**
     * @DI\InjectParams({
     *  "superHeroDao" = @DI\Inject("comic.superhero.dao"),
     * })
     */
    public function __construct($superHeroDao) {
        $this->superHeroDao = $superHeroDao;
    }

    public function getSuperHeroDetail($comicName) {
        $detail = $this->superHeroDao->getSuperHeroDetail($comicName);
        return $detail;
    }

}
