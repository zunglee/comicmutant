<?php

namespace Zunglee\ComicBundle\Service\SuperHero;

use Zunglee\ComicBundle\Service\SuperHero\SuperHeroService;
use JMS\DiExtraBundle\Annotation as DI;
use Exception;

/**
 * Description of HomePageManager
 * @author ankitesh
 * 
 * @DI\Service("comic.homepage.manager")
 */
class SuperHeroManager {
     
    private $superHeroService;
    
    /**
     * @DI\InjectParams({
     *  "superHeroService" = @DI\Inject("comic.superhero.service"),
     * })
     */
    public function __construct($superHeroService) {
        $this->superHeroService = $superHeroService;
    }
    
   public function getSuperHeroDetail($comicName){
       return $this->superHeroService->getSuperHeroDetail($comicName);
   } 
    
}
