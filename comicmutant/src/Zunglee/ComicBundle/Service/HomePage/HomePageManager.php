<?php

namespace Zunglee\ComicBundle\Service\HomePage;

use JMS\DiExtraBundle\Annotation as DI;
use Exception;

/**
 * Description of HomePageManager
 * @author ankitesh
 * 
 * @DI\Service("comic.homepage.manager")
 */
class HomePageManager {
    
    private $homePageService;
    
    /**
     * @DI\InjectParams({
     *  "homePageService" = @DI\Inject("comic.homepage.service"),
     * })
     */

    public function __construct($homePageService) {
        $this->homePageService = $homePageService;
    }
    
    
   public function getHomePageParam(){
       return $this->homePageService->getHomePageContent();
   } 
    
}
