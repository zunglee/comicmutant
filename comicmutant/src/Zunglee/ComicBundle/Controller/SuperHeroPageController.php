<?php

namespace Zunglee\ComicBundle\Controller;

use JMS\DiExtraBundle\Annotation as DI;
use Sensio\Bundle\FrameworkExtraBundle\Configuration as config;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Description of SuperHeroPageController
 * @author ankitesh
 * @config\Route("/comic")
 */
class SuperHeroPageController extends BaseController {

    /**
     * @DI\Inject("comic.homepage.manager")
     */
    public $superHeroDetailMgr;

    /**
     *
     * @config\Route(
     * "/superheroes",
     * name="superhero_list"
     * )
     * @config\Method("GET")
     * */
    public function superHeroListAction() {
        $x = $this->render('ZungleeComicBundle:desktop/superHeroPage:superHeroPage.html.twig');
        file_put_contents('/tmp/com.txt', $x);
        return $x;
        $this->homepageMngr->getHomePageParam();
        $param = array();
    }

    /**
     *
     * @config\Route(
     * "/superhero/{comicName}",
     * name="superhero_page"
     * )
     * @config\Method("GET")
     * */
    public function superHeroPageAction($comicName) {
        $param = array();
        $comicDetailModel = $this->superHeroDetailMgr->getSuperHeroDetail($comicName);
        $param["comicDetailModel"] = $comicDetailModel;
        return $this->renderPage('ZungleeComicBundle:desktop/superHeroPage:superHeroPage.html.twig', $param);
    }

}
