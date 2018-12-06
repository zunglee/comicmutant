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
     * "/",
     * name="homepage"
     * )
     * @config\Method("GET")
     * */
    public function homePageAction() {
        $x = $this->render('ZungleeComicBundle:desktop/superHeroPage:superHeroPage.html.twig');
        file_put_contents('/tmp/com.txt', $x);
        return $x;
        $this->homepageMngr->getHomePageParam();
        $param = array();
    }

}
