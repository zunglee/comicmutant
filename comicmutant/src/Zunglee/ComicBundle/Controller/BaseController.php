<?php

namespace Zunglee\ComicBundle\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\Controller;
use JMS\DiExtraBundle\Annotation as DI;
use Sensio\Bundle\FrameworkExtraBundle\Configuration as config;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Description of BaseController
 *
 * @author ankitesh
 */
class BaseController extends Controller {
    
    
    public function renderPage($twig,$param = array(), Response $response = null ){
        return parent::render($twig, $param, $response);
    }
    
    
    
}
