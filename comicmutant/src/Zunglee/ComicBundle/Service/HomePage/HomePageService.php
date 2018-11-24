<?php

namespace Zunglee\ComicBundle\Service\HomePage;

use JMS\DiExtraBundle\Annotation as DI;
use Exception;

/**
 * @author ankitesh
 * 
 * @DI\Service("comic.homepage.service")
 */
class HomePageService {
    
    
    private $homePageDaoService;
    private $homePageHandler;
    
    /**
     * @DI\InjectParams({
     *  "homePageDaoService" = @DI\Inject("comic.homepage.dao"),
     *  "homePageHandler" = @DI\Inject("comic.homepage.handler"),
     * })
     */
    public function __construct($homePageDaoService,$homePageHandler) {
        $this->homePageDaoService = $homePageDaoService;
        $this->homePageHandler = $homePageHandler;
    }

    public function getHomePageContent(){
         return $this->homePageDaoService->getHomePageContent();
    }
    
    
}
