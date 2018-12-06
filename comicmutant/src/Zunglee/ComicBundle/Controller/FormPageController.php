<?php

namespace Zunglee\ComicBundle\Controller;

use JMS\DiExtraBundle\Annotation as DI;
use Sensio\Bundle\FrameworkExtraBundle\Configuration as config;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Description of FormPageController
 *
 * @author ankitesh
 */
class FormPageController {

    /**
     *
     * @config\Route(
     * "/data/entry/inputform",
     * name="data_form"
     * )
     * @config\Method("GET")
     * */
    public function fromPageAction() {
        $x = $this->render('ZungleeComicBundle:desktop/superHeroPage:superHeroPage.html.twig');
        file_put_contents('/tmp/com.txt', $x);
        return $x;
        $this->homepageMngr->getHomePageParam();
        $param = array();
    }

}
