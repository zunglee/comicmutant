<?php

namespace Zunglee\ComicBundle\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\Controller;

class DefaultController extends Controller
{
    public function indexAction()
    {
        return $this->render('ZungleeComicBundle:desktop/common:layout.html.twig');
    }
}
