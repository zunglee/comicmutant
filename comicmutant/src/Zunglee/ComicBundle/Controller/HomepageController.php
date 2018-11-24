<?php

namespace Zunglee\ComicBundle\Controller;

use JMS\DiExtraBundle\Annotation as DI;
use Sensio\Bundle\FrameworkExtraBundle\Configuration as config;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Description of HomepageController
 *
 * @author ankitesh
 */
class HomepageController extends BaseController {

    /**
     * @DI\Inject("comic.homepage.manager")
     */
    public $homepageMngr;

    /**
     *
     * @config\Route(
     * "/home",
     * name="homepage"
     * )
     * @config\Method("GET")
     * */
    public function homePageAction() {
        $this->homepageMngr->getHomePageParam();
        die('Here in Home page controller');
        $param = array();
    }

}
