<?php

namespace Zunglee\ComicBundle\Service\HomePage;

use JMS\DiExtraBundle\Annotation as DI;
use Exception;

/**
 * @author ankitesh
 * 
 * @DI\Service("comic.homepage.dao.pdo")
 */
class HomePageDaoPdo {
    
    
    
    public function getHomePageContent(){
        die('in Dao pdo');
    }
    
}
