<?php

namespace Zunglee\ComicBundle\Service\HomePage;

use JMS\DiExtraBundle\Annotation as DI;
use Exception;

/**
 * @author ankitesh
 * 
 * @DI\Service("comic.homepage.dao")
 */
class HomePageDaoService {

    private $homePageDaoPdo;

    /**
     * @DI\InjectParams({
     *  "homePageDaoPdo" = @DI\Inject("comic.homepage.dao.pdo"),
     * })
     */
    public function __construct($homePageDaoPdo) {
        $this->homePageDaoPdo = $homePageDaoPdo;
    }

    public function getHomePageContent() {
        return $this->homePageDaoPdo->getHomePageContent();
    }

}
